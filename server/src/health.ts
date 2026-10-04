import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { redis } from "./db";
import { prisma } from "./prisma";

type ServiceStatus = "up" | "down";

async function checkPostgres(): Promise<ServiceStatus> {
  try {
    await prisma.$queryRaw(Prisma.sql`SELECT 1`);
    return "up";
  } catch {
    return "down";
  }
}

async function checkRedis(): Promise<ServiceStatus> {
  try {
    const reply = await redis.ping();
    return reply === "PONG" ? "up" : "down";
  } catch {
    return "down";
  }
}

export async function healthHandler(_req: Request, res: Response): Promise<void> {
  const [postgres, redisStatus] = await Promise.all([
    checkPostgres(),
    checkRedis(),
  ]);

  const ok = postgres === "up" && redisStatus === "up";

  res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "degraded",
    postgres,
    redis: redisStatus,
  });
}
