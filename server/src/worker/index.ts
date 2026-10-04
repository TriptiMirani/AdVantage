import { redis, waitForRedisReady } from "../db";
import { prisma } from "../prisma";
import { createFlusher, type FlushStatus } from "./flush";
import { counterStore } from "./store";

const FLUSH_INTERVAL_MS = 60_000;
const FAILED: FlushStatus[] = ["aborted", "retry_later"];

const flusher = createFlusher(counterStore, console);

async function disconnect(): Promise<void> {
  await prisma.$disconnect();
  redis.disconnect();
}

async function main(): Promise<void> {
  await waitForRedisReady(10_000);

  if (process.argv.includes("--once")) {
    const status = await flusher.flushOnce();
    console.info(`flush finished: ${status}`);
    process.exitCode = FAILED.includes(status) ? 1 : 0;
    await disconnect();
    return;
  }

  const timer = setInterval(() => {
    void flusher.flushOnce();
  }, FLUSH_INTERVAL_MS);
  console.info(`sync worker running, flushing every ${FLUSH_INTERVAL_MS / 1000}s. Press Ctrl+C to stop.`);

  process.once("SIGINT", () => {
    console.info("SIGINT: stopping timer, finishing any flush in progress, then one final flush");
    clearInterval(timer);
    void (async () => {
      await flusher.idle();
      const status = await flusher.flushOnce();
      console.info(`final flush finished: ${status}`);
      await disconnect();
      process.exit(FAILED.includes(status) ? 1 : 0);
    })();
  });
}

main().catch((err: unknown) => {
  console.error("sync worker failed to start", err);
  process.exitCode = 1;
});
