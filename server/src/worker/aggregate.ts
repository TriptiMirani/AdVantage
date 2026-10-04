import { parseStatKey } from "../stats/keys";

export type RawCounter = { key: string; value: number };

export type CampaignCost = {
  id: string;
  costPerImpressionMicros: number;
  costPerClickCents: number;
  budgetCents: number;
};

export type HourlyRow = {
  campaignId: string;
  hourBucket: Date;
  impressions: number;
  clicks: number;
  spendMicros: number;
};

export type DailyRow = {
  campaignId: string;
  dayBucket: Date;
  impressions: number;
  clicks: number;
  spendMicros: number;
};

export type CampaignSpend = { campaignId: string; spendMicros: number; budgetCents: number };

export type Aggregation = {
  hourly: HourlyRow[];
  daily: DailyRow[];
  campaigns: CampaignSpend[];
  // Counters that made it into the rows above.
  used: RawCounter[];
  // Malformed keys, or campaigns deleted since the event. Written nowhere, but still cleared from Redis after commit.
  dropped: RawCounter[];
};

const MICROS_PER_CENT = 10_000;

// Spend stays in exact micros. Hourly, daily, and campaign totals are sums of the same integers,
// so the three tables always agree.
export function aggregate(counters: RawCounter[], costs: Map<string, CampaignCost>): Aggregation {
  const hourlyTotals = new Map<
    string,
    { campaignId: string; hourBucket: Date; impressions: number; clicks: number; spendMicros: number }
  >();
  const used: RawCounter[] = [];
  const dropped: RawCounter[] = [];

  for (const counter of counters) {
    const parsed = parseStatKey(counter.key);
    const cost = parsed ? costs.get(parsed.campaignId) : undefined;
    if (!parsed || !cost) {
      dropped.push(counter);
      continue;
    }
    used.push(counter);

    const mapKey = `${parsed.campaignId}|${parsed.hourBucket.toISOString()}`;
    const row = hourlyTotals.get(mapKey) ?? {
      campaignId: parsed.campaignId,
      hourBucket: parsed.hourBucket,
      impressions: 0,
      clicks: 0,
      spendMicros: 0,
    };
    if (parsed.type === "impression") {
      row.impressions += counter.value;
      row.spendMicros += counter.value * cost.costPerImpressionMicros;
    } else {
      row.clicks += counter.value;
      row.spendMicros += counter.value * cost.costPerClickCents * MICROS_PER_CENT;
    }
    hourlyTotals.set(mapKey, row);
  }

  const hourly: HourlyRow[] = [];
  const dailyTotals = new Map<string, DailyRow>();
  const campaignTotals = new Map<string, CampaignSpend>();

  for (const row of hourlyTotals.values()) {
    hourly.push({
      campaignId: row.campaignId,
      hourBucket: row.hourBucket,
      impressions: row.impressions,
      clicks: row.clicks,
      spendMicros: row.spendMicros,
    });

    const dayBucket = new Date(
      Date.UTC(row.hourBucket.getUTCFullYear(), row.hourBucket.getUTCMonth(), row.hourBucket.getUTCDate()),
    );
    const dayKey = `${row.campaignId}|${dayBucket.toISOString()}`;
    const day = dailyTotals.get(dayKey) ?? {
      campaignId: row.campaignId,
      dayBucket,
      impressions: 0,
      clicks: 0,
      spendMicros: 0,
    };
    day.impressions += row.impressions;
    day.clicks += row.clicks;
    day.spendMicros += row.spendMicros;
    dailyTotals.set(dayKey, day);

    const campaign = campaignTotals.get(row.campaignId) ?? {
      campaignId: row.campaignId,
      spendMicros: 0,
      budgetCents: costs.get(row.campaignId)?.budgetCents ?? 0,
    };
    campaign.spendMicros += row.spendMicros;
    campaignTotals.set(row.campaignId, campaign);
  }

  return {
    hourly,
    daily: [...dailyTotals.values()],
    campaigns: [...campaignTotals.values()],
    used,
    dropped,
  };
}
