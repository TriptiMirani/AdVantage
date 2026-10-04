import Redis from "ioredis";
import { config } from "./config";

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 1,
  connectTimeout: 2000,
  enableOfflineQueue: false,
});

redis.on("error", () => {
  // Health endpoint reports this; no secret or stack dump here.
});

// The client has enableOfflineQueue off, so a command sent before the connection is ready fails at once.
export function waitForRedisReady(timeoutMs: number): Promise<void> {
  if (redis.status === "ready") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Redis not ready after ${timeoutMs}ms`)), timeoutMs);
    redis.once("ready", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
