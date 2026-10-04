export type CampaignInfo = {
  id: string;
  name: string;
  status: string;
  budgetCents: number;
  spentMicros: bigint;
};

export type RangeSums = {
  impressions: number;
  clicks: number;
  spendMicros: bigint;
};

export type SortKey = "spend" | "impressions" | "clicks";

export type RankedCampaign = CampaignInfo & {
  sums: RangeSums;
  hasActivity: boolean;
};

const ZERO: RangeSums = { impressions: 0, clicks: 0, spendMicros: BigInt(0) };

// Every campaign is listed. Campaigns with activity in the range come first, ordered by the chosen metric
// (highest first). Ties break on name, then id, so pages are stable. Idle campaigns follow in name order.
export function rankCampaigns(
  campaigns: CampaignInfo[],
  sumsById: Map<string, RangeSums>,
  options: { sort: SortKey; q?: string; offset: number; limit: number },
): { total: number; rows: RankedCampaign[] } {
  const needle = options.q?.trim().toLowerCase() ?? "";
  const ranked: RankedCampaign[] = campaigns
    .filter((campaign) => needle === "" || campaign.name.toLowerCase().includes(needle))
    .map((campaign) => {
      const sums = sumsById.get(campaign.id);
      return { ...campaign, sums: sums ?? ZERO, hasActivity: sums !== undefined };
    });

  ranked.sort((a, b) => {
    if (a.hasActivity !== b.hasActivity) return a.hasActivity ? -1 : 1;
    const byMetric = compareMetric(b, a, options.sort);
    if (byMetric !== 0) return byMetric;
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return {
    total: ranked.length,
    rows: ranked.slice(options.offset, options.offset + options.limit),
  };
}

function compareMetric(a: RankedCampaign, b: RankedCampaign, sort: SortKey): number {
  if (sort === "spend") {
    return a.sums.spendMicros === b.sums.spendMicros ? 0 : a.sums.spendMicros < b.sums.spendMicros ? -1 : 1;
  }
  return a.sums[sort] - b.sums[sort];
}
