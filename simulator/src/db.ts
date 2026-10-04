import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

const COMPOSE = ["compose", "exec", "-T"];

// Uses the database container's own psql, so the simulator needs no database driver.
export async function psql(sql: string): Promise<string> {
  const { stdout } = await run(
    "docker",
    [...COMPOSE, "postgres", "psql", "-U", "advantage", "-d", "advantage", "-At", "-F", "|", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 },
  );
  return stdout.trim();
}

export async function redis(args: string[]): Promise<string> {
  const { stdout } = await run("docker", [...COMPOSE, "redis", "redis-cli", ...args], {
    cwd: REPO_ROOT,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

// Every stats counter currently in Redis. SCAN, never KEYS.
export async function redisStatsCounters(): Promise<Map<string, number>> {
  const keys = (await redis(["--scan", "--pattern", "stats:*"])).split(/\r?\n/).filter((line) => line.length > 0);
  const counters = new Map<string, number>();
  for (let start = 0; start < keys.length; start += 200) {
    const chunk = keys.slice(start, start + 200);
    const values = (await redis(["MGET", ...chunk])).split(/\r?\n/);
    chunk.forEach((key, index) => {
      const value = Number(values[index]);
      if (Number.isFinite(value)) counters.set(key, value);
    });
  }
  return counters;
}

export async function redisInstantaneousOps(): Promise<number> {
  const info = await redis(["INFO", "stats"]);
  const match = /instantaneous_ops_per_sec:(\d+)/.exec(info);
  return match ? Number(match[1]) : Number.NaN;
}

// Exact commit times of worker flushes since the given instant. Unlike the statistics counters, these are not delayed.
export async function flushCommitsSince(since: Date): Promise<Date[]> {
  const output = await psql(
    `SELECT "committedAt" FROM "FlushBatch" WHERE "committedAt" >= '${since.toISOString().replace("Z", "")}' ORDER BY 1;`,
  );
  return output
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => new Date(`${line.replace(" ", "T")}Z`));
}

export const WRITE_TABLES = ["HourlyStat", "DailyStat", "Campaign", "FlushBatch"] as const;

// Rows inserted, updated, or deleted since the statistics were last reset. Postgres flushes these counters
// about once a second, so callers wait before reading.
export async function writeCounts(): Promise<Record<string, number>> {
  const list = WRITE_TABLES.map((table) => `'${table}'`).join(",");
  const output = await psql(
    `SELECT relname, n_tup_ins + n_tup_upd + n_tup_del FROM pg_stat_user_tables WHERE relname IN (${list});`,
  );
  const counts: Record<string, number> = {};
  for (const table of WRITE_TABLES) counts[table] = 0;
  for (const line of output.split(/\r?\n/)) {
    const [name, value] = line.split("|");
    if (name && value !== undefined) counts[name] = Number(value);
  }
  return counts;
}
