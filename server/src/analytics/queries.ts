import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import type { CampaignsQuery, SummaryQuery, TimeseriesQuery } from "../schemas/analytics";
import { ctr, formatSpend, remainingCents } from "./format";
import { rankCampaigns } from "./rank";

const DAY_MS = 86_400_000;

type Sums = {
  impressions: number | null;
  clicks: number | null;
  spendMicros: bigint | null;
};

// [from 00:00 UTC, day after to 00:00 UTC). Half-open so the end day is included.
function bounds(from: string, to: string): { gte: Date; lt: Date } {
  return {
    gte: new Date(`${from}T00:00:00.000Z`),
    lt: new Date(Date.parse(`${to}T00:00:00.000Z`) + DAY_MS),
  };
}

function totals(sums: Sums) {
  const impressions = sums.impressions ?? 0;
  const clicks = sums.clicks ?? 0;
  return {
    impressions,
    clicks,
    ctr: ctr(clicks, impressions),
    ...formatSpend(sums.spendMicros ?? BigInt(0)),
  };
}

// Lifetime budget and spend come from Campaign only. Joining the stats tables would multiply each budget by its row count.
async function lifetimeBudget(campaignId?: string) {
  const sums = await prisma.campaign.aggregate({
    where: campaignId ? { id: campaignId } : {},
    _sum: { budgetCents: true, spentMicros: true },
  });
  const budgetCents = sums._sum.budgetCents ?? 0;
  const spentMicros = sums._sum.spentMicros ?? BigInt(0);
  const spent = formatSpend(spentMicros);
  return {
    budgetCents,
    spentMicros: spent.spendMicros,
    spentCents: spent.spendCents,
    remainingCents: remainingCents(budgetCents, spentMicros),
  };
}

export async function summary(query: SummaryQuery) {
  const [result, lifetime] = await Promise.all([
    prisma.dailyStat.aggregate({
      where: {
        dayBucket: bounds(query.from, query.to),
        ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      },
      _sum: { impressions: true, clicks: true, spendMicros: true },
    }),
    lifetimeBudget(query.campaignId),
  ]);
  return {
    from: query.from,
    to: query.to,
    campaignId: query.campaignId ?? null,
    ...totals(result._sum),
    lifetime,
  };
}

// Buckets with no activity are omitted. The dashboard fills gaps when it draws the chart.
export async function timeseries(query: TimeseriesQuery) {
  const sums = { _sum: { impressions: true, clicks: true, spendMicros: true } } as const;
  const campaignFilter = query.campaignId ? { campaignId: query.campaignId } : {};

  if (query.granularity === "hour") {
    const rows = await prisma.hourlyStat.groupBy({
      by: ["hourBucket"],
      where: { hourBucket: bounds(query.from, query.to), ...campaignFilter },
      ...sums,
      orderBy: { hourBucket: "asc" },
    });
    return {
      granularity: query.granularity,
      from: query.from,
      to: query.to,
      campaignId: query.campaignId ?? null,
      buckets: rows.map((row) => ({
        bucket: row.hourBucket.toISOString(),
        ...totals(row._sum),
      })),
    };
  }

  const rows = await prisma.dailyStat.groupBy({
    by: ["dayBucket"],
    where: { dayBucket: bounds(query.from, query.to), ...campaignFilter },
    ...sums,
    orderBy: { dayBucket: "asc" },
  });
  return {
    granularity: query.granularity,
    from: query.from,
    to: query.to,
    campaignId: query.campaignId ?? null,
    buckets: rows.map((row) => ({
      bucket: row.dayBucket.toISOString(),
      ...totals(row._sum),
    })),
  };
}

// Lifetime spend for one campaign row. Named spentMicros/spentCents so it cannot be confused with range spend.
function lifetimeSpend(spentMicros: bigint | undefined): { spentMicros: string | null; spentCents: number | null } {
  if (spentMicros === undefined) return { spentMicros: null, spentCents: null };
  const spent = formatSpend(spentMicros);
  return { spentMicros: spent.spendMicros, spentCents: spent.spendCents };
}

// Every campaign is listed, including idle ones. Range totals come from one grouped read, and ranking,
// filtering, and paging happen in rankCampaigns. Reads all campaigns per request; fine at seeded scale.
export async function campaigns(query: CampaignsQuery) {
  const [sumRows, campaignRows] = await Promise.all([
    prisma.dailyStat.groupBy({
      by: ["campaignId"],
      where: { dayBucket: bounds(query.from, query.to) },
      _sum: { impressions: true, clicks: true, spendMicros: true },
    }),
    prisma.campaign.findMany({
      select: { id: true, name: true, status: true, budgetCents: true, spentMicros: true },
    }),
  ]);

  const sumsById = new Map(
    sumRows.map((row) => [
      row.campaignId,
      {
        impressions: row._sum.impressions ?? 0,
        clicks: row._sum.clicks ?? 0,
        spendMicros: row._sum.spendMicros ?? BigInt(0),
      },
    ]),
  );

  const { total, rows } = rankCampaigns(campaignRows, sumsById, {
    sort: query.sort,
    q: query.q,
    offset: query.offset,
    limit: query.limit,
  });

  return {
    from: query.from,
    to: query.to,
    sort: query.sort,
    q: query.q ?? null,
    limit: query.limit,
    offset: query.offset,
    total,
    campaigns: rows.map((row) => ({
      campaignId: row.id,
      name: row.name,
      status: row.status,
      hasActivity: row.hasActivity,
      budgetCents: row.budgetCents,
      ...lifetimeSpend(row.spentMicros),
      ...totals(row.sums),
    })),
  };
}
