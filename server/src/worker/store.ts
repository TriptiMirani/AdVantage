import { CampaignStatus, Prisma } from "@prisma/client";
import { redis } from "../db";
import { prisma } from "../prisma";
import { parseStagedKey, stagedKey } from "../stats/keys";
import type { Aggregation, CampaignCost } from "./aggregate";
import type { CounterStore, StagedCounter, StagedKey } from "./flush";

const MICROS_PER_CENT = BigInt(10_000);
const SCAN_COUNT = 500;

// SCAN may return a key more than once, and it can miss keys created mid-scan. Both are harmless here:
// the next tick picks up anything missed, and a second RENAME of the same key fails and is skipped.
async function scanKeys(match: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = "0";
  do {
    const [next, batch] = await redis.scan(cursor, "MATCH", match, "COUNT", SCAN_COUNT);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== "0");
  return keys;
}

export const counterStore: CounterStore = {
  async listStagedBatches() {
    const batches = new Map<string, StagedKey[]>();
    for (const stagedKeyName of await scanKeys("flushing:*")) {
      const parsed = parseStagedKey(stagedKeyName);
      if (!parsed) continue;
      const list = batches.get(parsed.batchId) ?? [];
      list.push({ stagedKey: stagedKeyName, statKey: parsed.statKey });
      batches.set(parsed.batchId, list);
    }
    return batches;
  },

  async stageNewCounters(batchId: string) {
    const staged: StagedKey[] = [];
    const keys = await scanKeys("stats:*");
    for (let start = 0; start < keys.length; start += SCAN_COUNT) {
      const chunk = keys.slice(start, start + SCAN_COUNT);
      const pipeline = redis.pipeline();
      for (const key of chunk) {
        pipeline.rename(key, stagedKey(batchId, key));
      }
      const results = (await pipeline.exec()) ?? [];
      results.forEach(([err], index) => {
        // A failed RENAME (for example, the key was already gone) leaves nothing to stage.
        if (!err) {
          staged.push({ stagedKey: stagedKey(batchId, chunk[index]), statKey: chunk[index] });
        }
      });
    }
    return staged;
  },

  async readCounters(staged: StagedKey[]) {
    const counters: StagedCounter[] = [];
    for (let start = 0; start < staged.length; start += SCAN_COUNT) {
      const chunk = staged.slice(start, start + SCAN_COUNT);
      const pipeline = redis.pipeline();
      for (const entry of chunk) {
        pipeline.get(entry.stagedKey);
      }
      const results = (await pipeline.exec()) ?? [];
      results.forEach(([err, value], index) => {
        if (err) throw err;
        if (value !== null) {
          counters.push({
            stagedKey: chunk[index].stagedKey,
            key: chunk[index].statKey,
            value: Number(value),
          });
        }
      });
    }
    return counters;
  },

  async isBatchCommitted(batchId: string) {
    const row = await prisma.flushBatch.findUnique({ where: { id: batchId }, select: { id: true } });
    return row !== null;
  },

  async findCampaignCosts(campaignIds: string[]): Promise<Map<string, CampaignCost>> {
    const rows = await prisma.campaign.findMany({
      where: { id: { in: campaignIds } },
      select: { id: true, costPerImpressionMicros: true, costPerClickCents: true, budgetCents: true },
    });
    return new Map(rows.map((row) => [row.id, row]));
  },

  // One transaction: the ledger row and every money write commit together, or none of them do.
  // A campaign's spend increment must run before the budget check that reads it.
  async commitBatch(batchId: string, aggregation: Aggregation): Promise<void> {
    const operations: Prisma.PrismaPromise<unknown>[] = [
      prisma.flushBatch.create({ data: { id: batchId } }),
    ];

    for (const row of aggregation.hourly) {
      const spendMicros = BigInt(row.spendMicros);
      operations.push(
        prisma.hourlyStat.upsert({
          where: {
            campaignId_hourBucket: { campaignId: row.campaignId, hourBucket: row.hourBucket },
          },
          create: {
            campaignId: row.campaignId,
            hourBucket: row.hourBucket,
            impressions: row.impressions,
            clicks: row.clicks,
            spendMicros,
          },
          update: {
            impressions: { increment: row.impressions },
            clicks: { increment: row.clicks },
            spendMicros: { increment: spendMicros },
          },
        }),
      );
    }

    for (const row of aggregation.daily) {
      const spendMicros = BigInt(row.spendMicros);
      operations.push(
        prisma.dailyStat.upsert({
          where: {
            campaignId_dayBucket: { campaignId: row.campaignId, dayBucket: row.dayBucket },
          },
          create: {
            campaignId: row.campaignId,
            dayBucket: row.dayBucket,
            impressions: row.impressions,
            clicks: row.clicks,
            spendMicros,
          },
          update: {
            impressions: { increment: row.impressions },
            clicks: { increment: row.clicks },
            spendMicros: { increment: spendMicros },
          },
        }),
      );
    }

    for (const campaign of aggregation.campaigns) {
      operations.push(
        prisma.campaign.update({
          where: { id: campaign.campaignId },
          data: { spentMicros: { increment: BigInt(campaign.spendMicros) } },
        }),
      );
      operations.push(
        prisma.campaign.updateMany({
          where: {
            id: campaign.campaignId,
            status: { in: [CampaignStatus.ACTIVE, CampaignStatus.PAUSED] },
            spentMicros: { gte: BigInt(campaign.budgetCents) * MICROS_PER_CENT },
          },
          data: { status: CampaignStatus.ENDED },
        }),
      );
    }

    await prisma.$transaction(operations);
  },

  async deleteStaged(stagedKeys: string[]) {
    for (let start = 0; start < stagedKeys.length; start += SCAN_COUNT) {
      const pipeline = redis.pipeline();
      for (const key of stagedKeys.slice(start, start + SCAN_COUNT)) {
        pipeline.del(key);
      }
      for (const [err] of (await pipeline.exec()) ?? []) {
        if (err) throw err;
      }
    }
  },
};
