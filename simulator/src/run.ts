import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { promisify } from "node:util";
import { createLoadCampaigns, fetchAnalyticsSample } from "./api";
import { REPO_ROOT, flushCommitsSince, redisInstantaneousOps, redisStatsCounters, writeCounts } from "./db";
import { runStep, type StepResult, type Tally } from "./load";
import { summarize } from "./stats";
import { commitsInWindow, compareTotals, decideVerification, expectedTotals, postgresTotals, redisTotals } from "./verify";

const execAsync = promisify(execFile);
const HOST = { host: "localhost", port: 3001 };
// Postgres publishes write counters with a delay. Reads wait this long so a step's writes are not
// attributed to the wrong window, and setup writes (the campaign inserts) are published before the first step.
const SETTLE_MS = 3000;
const LOOP_DELAY_SUSPECT_MS = 50;

type Args = { steps: number[]; seconds: number; rest: number; campaigns: number };

function parseArgs(argv: string[]): Args {
  const value = (name: string, fallback: string) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
  };
  return {
    steps: value("steps", "50,75,100,150,200").split(",").map((step) => Number(step.trim())),
    seconds: Number(value("seconds", "30")),
    rest: Number(value("rest", "5")),
    campaigns: Number(value("campaigns", "50")),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function flushOnce(): Promise<string> {
  const { stdout } = await execAsync("npm run worker -- --once", {
    cwd: path.join(REPO_ROOT, "server"),
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout.trim().split(/\r?\n/).filter((line) => line.startsWith("flush finished")).join("; ");
}

function sumWrites(delta: Record<string, number>): number {
  return Object.values(delta).reduce((total, value) => total + value, 0);
}

function diffCounts(before: Record<string, number>, after: Record<string, number>): Record<string, number> {
  const delta: Record<string, number> = {};
  for (const table of Object.keys(after)) delta[table] = after[table] - (before[table] ?? 0);
  return delta;
}

// Two runs at once share one server, and each run's flush lands inside the other's steps. The lock stops that.
async function acquireLock(file: string): Promise<void> {
  try {
    const existing = JSON.parse(await readFile(file, "utf8")) as { pid: number; startedAt: string };
    if (isAlive(existing.pid)) {
      throw new Error(`another benchmark run is in progress (pid ${existing.pid}, started ${existing.startedAt}); wait for it to finish`);
    }
    console.warn("removing a stale lock left by a run that is no longer alive");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("another benchmark run")) throw error;
  }
  await writeFile(file, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const lockFile = path.join(REPO_ROOT, "simulator", "out", "run.lock");
  await mkdir(path.dirname(lockFile), { recursive: true });
  await acquireLock(lockFile);
  try {
    await runBenchmark(args);
  } finally {
    await rm(lockFile, { force: true });
  }
}

async function runBenchmark(args: Args) {
  const runTag = Date.now().toString(36);
  console.log(`run ${runTag}: creating ${args.campaigns} load campaigns`);
  const runStart = new Date();
  const campaignIds = await createLoadCampaigns(runTag, args.campaigns);
  await sleep(SETTLE_MS);
  const tally: Tally = new Map();
  const steps: Record<string, unknown>[] = [];

  for (const rate of args.steps) {
    console.log(`step ${rate} req/s for ${args.seconds}s`);
    await sleep(SETTLE_MS);
    const writesBefore = await writeCounts();

    const analytics: { latencyMs: number; ok: boolean }[] = [];
    const sampler = setInterval(() => {
      fetchAnalyticsSample().then((sample) => analytics.push(...sample)).catch(() => undefined);
    }, 1000);

    const loopDelay = monitorEventLoopDelay({ resolution: 10 });
    loopDelay.enable();
    const stepStart = new Date();
    const { result, latencies }: { result: StepResult; latencies: number[] } = await runStep({
      rate,
      seconds: args.seconds,
      campaignIds,
      tally,
      baseUrl: HOST,
    });
    loopDelay.disable();
    clearInterval(sampler);
    const loopLagP99 = loopDelay.percentile(99) / 1e6;

    const redisOps = await redisInstantaneousOps();
    await sleep(SETTLE_MS);
    const writesAfter = await writeCounts();
    const writes = diffCounts(writesBefore, writesAfter);
    // Exact commit times, so a flush in this step is never missed or misattributed.
    const flushCommits = commitsInWindow(await flushCommitsSince(runStart), stepStart, new Date());

    const analyticsLatency = summarize(analytics.map((sample) => sample.latencyMs));
    const analyticsFailures = analytics.filter((sample) => !sample.ok).length;
    const latency = result.latencyMs;

    steps.push({
      targetRate: rate,
      achievedRate: Number(result.achievedRate.toFixed(1)),
      seconds: result.seconds,
      sent: result.sent,
      accepted: result.accepted,
      failed: result.failed,
      blocked: result.blocked,
      statusCounts: result.statusCounts,
      ingestionMs: { p50: latency.p50, p95: latency.p95, p99: latency.p99, max: latency.max },
      analyticsMs: { p50: analyticsLatency.p50, p95: analyticsLatency.p95, samples: analyticsLatency.count, failures: analyticsFailures },
      redisOpsPerSec: redisOps,
      flushCommits: flushCommits.map((time) => time.toISOString()),
      // Approximate: pg_stat counters are published with a delay. Flush detection uses flushCommits.
      postgresWritesDuringStep: writes,
      postgresWriteRowsDuringStep: sumWrites(writes),
      eventLoopLagP99Ms: Number(loopLagP99.toFixed(1)),
      suspectSimulator: loopLagP99 > LOOP_DELAY_SUSPECT_MS,
      latencySamples: latencies.length,
    });

    await sleep(args.rest * 1000);
  }

  console.log("verifying: Redis counters (diagnostic), one flush, then Postgres (primary check)");
  const expected = expectedTotals(tally);
  const acceptedEvents = [...tally.values()].reduce((sum, c) => sum + c.impressions + c.clicks, 0);
  const counters = await redisStatsCounters();
  const redisReadAt = new Date();
  const redisMismatches = compareTotals(expected, redisTotals(counters, new Set(campaignIds)), "redis", campaignIds);
  // Any flush between run start and the Redis read moved counts out of Redis, so the Redis check cannot apply.
  // This covers rests and the gap after the last step, not only the step windows.
  const flushesBeforeRedisRead = commitsInWindow(await flushCommitsSince(runStart), runStart, redisReadAt);

  const writesBeforeFlush = await writeCounts();
  const flushStarted = Date.now();
  const flushSummary = await flushOnce();
  const flushMs = Date.now() - flushStarted;
  await sleep(SETTLE_MS);
  const writesAfterFlush = await writeCounts();
  const flushWrites = diffCounts(writesBeforeFlush, writesAfterFlush);

  const postgresMismatches = compareTotals(expected, await postgresTotals(campaignIds), "postgres", campaignIds);
  const concurrentFlush = flushesBeforeRedisRead.length > 0;
  const verdict = decideVerification(postgresMismatches.length, {
    applicable: !concurrentFlush,
    mismatchCount: redisMismatches.length,
  });
  const mismatches = [...postgresMismatches, ...redisMismatches];

  const verification = {
    acceptedEvents,
    stepsWithConcurrentFlush: steps.filter((step) => (step.flushCommits as string[]).length > 0).length,
    flushesBeforeRedisRead: flushesBeforeRedisRead.map((time) => time.toISOString()),
    redisCheck: verdict.redisNote,
    primaryMismatchCount: postgresMismatches.length,
    redisMismatchCount: redisMismatches.length,
    flushSummary,
    flushMs,
    campaigns: campaignIds.length,
    flushWrites,
    flushWriteRows: sumWrites(flushWrites),
    pass: verdict.pass,
    mismatches: mismatches.slice(0, 20),
    mismatchCount: mismatches.length,
  };

  const output = { runTag, campaigns: args.campaigns, seconds: args.seconds, steps, verification };
  const outDir = path.join(REPO_ROOT, "simulator", "out");
  await mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `${runTag}.json`);
  await writeFile(outFile, JSON.stringify(output, null, 2));

  printTable(steps);
  console.log(
    `\nverification: ${verification.pass ? "PASS" : "FAIL"} (${acceptedEvents} accepted events; Postgres primary check: ${postgresMismatches.length} mismatches; Redis check: ${verdict.redisNote})`,
  );
  console.log(`flush: ${flushSummary} in ${flushMs} ms; Postgres rows written by the flush: ${verification.flushWriteRows}`);
  console.log(`saved ${outFile}`);
}

function printTable(steps: Record<string, unknown>[]) {
  const header = "| Target req/s | Achieved | Accepted | Failed | p50 ms | p95 ms | p99 ms | Max ms | Dashboard p50 / p95 ms | Postgres rows written (approx.) | Redis ops/s | Loop lag p99 ms | Note |";
  console.log(`\n${header}`);
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const step of steps) {
    const ingestion = step.ingestionMs as { p50: number; p95: number; p99: number; max: number };
    const analytics = step.analyticsMs as { p50: number; p95: number };
    const commits = step.flushCommits as string[];
    const flagged = [
      step.suspectSimulator ? "simulator lagging" : "",
      ...commits.map((iso) => `worker flush committed ${iso.slice(11, 19)} UTC`),
    ].filter((text) => text.length > 0);
    const note = flagged.join("; ");
    console.log(
      `| ${step.targetRate} | ${step.achievedRate} | ${step.accepted} | ${step.failed} | ${ingestion.p50.toFixed(2)} | ${ingestion.p95.toFixed(2)} | ${ingestion.p99.toFixed(2)} | ${ingestion.max.toFixed(2)} | ${analytics.p50.toFixed(1)} / ${analytics.p95.toFixed(1)} | ${step.postgresWriteRowsDuringStep} | ${step.redisOpsPerSec} | ${step.eventLoopLagP99Ms} | ${note} |`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
