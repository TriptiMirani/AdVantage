// Mirrors the analytics responses in server/src/analytics/queries.ts. Money stays as integers:
// spendMicros and spentMicros are strings (JSON cannot carry BigInt); *Cents fields are whole cents.

export type Totals = {
  impressions: number;
  clicks: number;
  ctr: number | null;
  spendMicros: string;
  spendCents: number;
};

export type LifetimeBudget = {
  budgetCents: number;
  spentMicros: string;
  spentCents: number;
  remainingCents: number;
};

export type SummaryResponse = Totals & {
  from: string;
  to: string;
  campaignId: string | null;
  lifetime: LifetimeBudget;
};

export type TimeseriesBucket = Totals & { bucket: string };

export type TimeseriesResponse = {
  granularity: "day" | "hour";
  from: string;
  to: string;
  campaignId: string | null;
  buckets: TimeseriesBucket[];
};

export type CampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ENDED";

export type CampaignRow = Totals & {
  campaignId: string;
  name: string | null;
  status: CampaignStatus | null;
  hasActivity: boolean;
  budgetCents: number | null;
  spentMicros: string | null;
  spentCents: number | null;
};

export type CampaignsResponse = {
  from: string;
  to: string;
  sort: "spend" | "impressions" | "clicks";
  q: string | null;
  limit: number;
  offset: number;
  total: number;
  campaigns: CampaignRow[];
};

// GET /campaigns/:id. Money fields follow the same rules as the analytics responses.
export type CampaignDetail = {
  id: string;
  name: string;
  status: CampaignStatus;
  budgetCents: number;
  spentMicros: string;
  spentCents: number;
  costPerImpressionMicros: number;
  costPerClickCents: number;
  targetAudience: Record<string, unknown>;
  creativeUrl: string;
  startDate: string;
  endDate: string;
};

export type CampaignSort = CampaignsResponse["sort"];
