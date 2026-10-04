import express from "express";
import type { Server } from "node:http";
import { config } from "./config";
import { redis, waitForRedisReady } from "./db";
import { errorMiddleware, sendError } from "./errors";
import { healthHandler } from "./health";
import { prisma } from "./prisma";
import { analyticsRouter } from "./routes/analytics";
import { campaignsRouter } from "./routes/campaigns";
import { trackRouter } from "./routes/track";

const app = express();

app.use(express.json({ limit: "32kb" }));

app.get("/health", healthHandler);
app.use("/campaigns", campaignsRouter);
app.use("/track", trackRouter);
app.use("/analytics", analyticsRouter);

app.use((_req, res) => {
  sendError(res, 404, "NOT_FOUND", "Route not found");
});

app.use(errorMiddleware);

// Listening only after Redis is ready keeps the first requests from failing with 503 during boot.
// If Redis is still down after the timeout, serve anyway so /health can report it.
let server: Server | undefined;

async function start(): Promise<void> {
  try {
    await waitForRedisReady(10_000);
  } catch {
    console.warn("Redis not ready at startup; serving anyway. /health reports Redis status.");
  }
  server = app.listen(config.PORT, () => {
    console.log(`AdVantage API listening on port ${config.PORT}`);
  });
}

async function shutdown(): Promise<void> {
  server?.close();
  await prisma.$disconnect().catch(() => undefined);
  redis.disconnect();
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});

void start();
