import { Router } from "express";
import type { CampaignStatus } from "@prisma/client";
import { createStatusCache } from "../campaignStatusCache";
import { redis } from "../db";
import { HttpError, notFound } from "../errors";
import { prisma } from "../prisma";
import { trackBodySchema } from "../schemas/track";
import { STAT_TTL_SECONDS, statKey } from "../stats/keys";

const getCampaignStatus = createStatusCache<CampaignStatus>({
  lookup: async (campaignId) => {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { status: true },
    });
    return campaign?.status ?? null;
  },
  ttlMs: 5_000,
  maxEntries: 10_000,
});

export const trackRouter = Router();

trackRouter.post("/", async (req, res, next) => {
  try {
    const body = trackBodySchema.parse(req.body);

    const status = await getCampaignStatus(body.campaignId);
    if (status === null) {
      throw notFound("Campaign not found");
    }
    if (status !== "ACTIVE") {
      throw new HttpError(409, "CAMPAIGN_NOT_ACTIVE", "Campaign is not active", { status });
    }

    const key = statKey({ campaignId: body.campaignId, type: body.type, at: new Date() });
    await incrementCounter(key);

    res.status(202).end();
  } catch (err) {
    next(err);
  }
});

// MULTI returns a per-command error list instead of throwing, so both the throw and the list must be checked.
// EXPIRE NX sets the safety TTL only on first creation, so later increments do not extend it.
async function incrementCounter(key: string): Promise<void> {
  let results: [Error | null, unknown][] | null;
  try {
    results = await redis.multi().incr(key).expire(key, STAT_TTL_SECONDS, "NX").exec();
  } catch {
    throw new HttpError(503, "UNAVAILABLE", "Event store is temporarily unavailable");
  }
  if (!results || results.some(([err]) => err !== null)) {
    throw new HttpError(503, "UNAVAILABLE", "Event store is temporarily unavailable");
  }
}
