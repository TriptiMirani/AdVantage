import type { CampaignSort, CampaignsResponse, SummaryResponse, TimeseriesResponse } from "../types";
import { requestJson } from "./http";

export type RangeParams = { from: string; to: string; campaignId?: string };

function rangeQuery(params: RangeParams): Record<string, string> {
  return params.campaignId
    ? { from: params.from, to: params.to, campaignId: params.campaignId }
    : { from: params.from, to: params.to };
}

function get<T>(path: string, params: Record<string, string>, signal: AbortSignal): Promise<T> {
  return requestJson<T>(`${path}?${new URLSearchParams(params).toString()}`, { method: "GET", signal });
}

export function fetchSummary(params: RangeParams, signal: AbortSignal): Promise<SummaryResponse> {
  return get<SummaryResponse>("/analytics/summary", rangeQuery(params), signal);
}

export function fetchTimeseries(
  params: RangeParams & { granularity: "day" | "hour" },
  signal: AbortSignal,
): Promise<TimeseriesResponse> {
  return get<TimeseriesResponse>(
    "/analytics/timeseries",
    { ...rangeQuery(params), granularity: params.granularity },
    signal,
  );
}

export type CampaignsParams = {
  from: string;
  to: string;
  sort: CampaignSort;
  q: string;
  limit: number;
  offset: number;
};

export function fetchCampaigns(params: CampaignsParams, signal: AbortSignal): Promise<CampaignsResponse> {
  const query: Record<string, string> = {
    from: params.from,
    to: params.to,
    sort: params.sort,
    limit: String(params.limit),
    offset: String(params.offset),
  };
  if (params.q.trim() !== "") query.q = params.q.trim();
  return get<CampaignsResponse>("/analytics/campaigns", query, signal);
}
