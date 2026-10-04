import { COST } from "./api";
import { psql } from "./db";
import type { Tally } from "./load";

export type Totals = { impressions: number; clicks: number; spendMicros: number };

// Spend is computed in micros from the same rates the campaigns were created with.
function spendMicros(impressions: number, clicks: number): number {
  return impressions * COST.perImpressionMicros + clicks * COST.perClickCents * 10_000;
}

export function expectedTotals(tally: Tally): Map<string, Totals> {
  const totals = new Map<string, Totals>();
  for (const [campaignId, counts] of tally) {
    totals.set(campaignId, {
      impressions: counts.impressions,
      clicks: counts.clicks,
      spendMicros: spendMicros(counts.impressions, counts.clicks),
    });
  }
  return totals;
}

// Keys look like stats:{campaignId}:{YYYYMMDDHH}:{type}. Only the given campaigns are counted.
export function redisTotals(counters: Map<string, number>, campaignIds: Set<string>): Map<string, Totals> {
  const totals = new Map<string, Totals>();
  for (const [key, value] of counters) {
    const [, campaignId, , type] = key.split(":");
    if (!campaignIds.has(campaignId)) continue;
    const entry = totals.get(campaignId) ?? { impressions: 0, clicks: 0, spendMicros: 0 };
    if (type === "impression") entry.impressions += value;
    if (type === "click") entry.clicks += value;
    totals.set(campaignId, entry);
  }
  for (const entry of totals.values()) {
    entry.spendMicros = spendMicros(entry.impressions, entry.clicks);
  }
  return totals;
}

export async function postgresTotals(campaignIds: string[]): Promise<Map<string, Totals>> {
  const list = campaignIds.map((id) => `'${id}'`).join(",");
  const output = await psql(
    `SELECT h."campaignId", SUM(h.impressions), SUM(h.clicks), SUM(h."spendMicros") FROM "HourlyStat" h WHERE h."campaignId" IN (${list}) GROUP BY h."campaignId";`,
  );
  const totals = new Map<string, Totals>();
  for (const line of output.split(/\r?\n/)) {
    if (line.length === 0) continue;
    const [campaignId, impressions, clicks, spend] = line.split("|");
    totals.set(campaignId, {
      impressions: Number(impressions),
      clicks: Number(clicks),
      spendMicros: Number(spend),
    });
  }
  return totals;
}

// Flush commits inside one step's window. The window is inclusive at both ends.
export function commitsInWindow(commits: Date[], start: Date, end: Date): Date[] {
  return commits.filter((time) => time.getTime() >= start.getTime() && time.getTime() <= end.getTime());
}

export type RedisCheck = { applicable: boolean; mismatchCount: number };

// The primary check is what proves zero loss: Postgres after the final flush. The Redis check only means
// something when no worker flush ran during the steps, because a flush moves counts out of Redis early.
export function decideVerification(
  primaryMismatchCount: number,
  redis: RedisCheck,
): { pass: boolean; redisNote: string } {
  const redisOk = !redis.applicable || redis.mismatchCount === 0;
  const redisNote = !redis.applicable
    ? "not applicable: worker flushed during the run"
    : redis.mismatchCount === 0
      ? "pass"
      : `FAIL (${redis.mismatchCount} mismatches)`;
  return { pass: primaryMismatchCount === 0 && redisOk, redisNote };
}

// Every campaign in any of the three views must match. A campaign missing from one view counts as zero there.
export function compareTotals(
  expected: Map<string, Totals>,
  actual: Map<string, Totals>,
  label: string,
  campaignIds: string[],
): string[] {
  const mismatches: string[] = [];
  const zero: Totals = { impressions: 0, clicks: 0, spendMicros: 0 };
  for (const campaignId of campaignIds) {
    const want = expected.get(campaignId) ?? zero;
    const got = actual.get(campaignId) ?? zero;
    if (want.impressions !== got.impressions || want.clicks !== got.clicks || want.spendMicros !== got.spendMicros) {
      mismatches.push(
        `${label} ${campaignId}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`,
      );
    }
  }
  return mismatches;
}
