import type { CampaignDetail, CampaignStatus } from "../types";
import { requestJson } from "./http";

// Body sent to POST and PATCH. Dates are full ISO timestamps; money is integers in the units the API uses.
export type CampaignBody = {
  name: string;
  status?: CampaignStatus;
  budgetCents: number;
  costPerImpressionMicros: number;
  costPerClickCents: number;
  targetAudience: Record<string, unknown>;
  creativeUrl: string;
  startDate: string;
  endDate: string;
};

export function fetchCampaign(id: string, signal: AbortSignal): Promise<CampaignDetail> {
  return requestJson<CampaignDetail>(`/campaigns/${encodeURIComponent(id)}`, { method: "GET", signal });
}

export function createCampaign(body: CampaignBody): Promise<CampaignDetail> {
  return requestJson<CampaignDetail>("/campaigns", { method: "POST", body: JSON.stringify(body) });
}

export function updateCampaign(id: string, body: Partial<CampaignBody>): Promise<CampaignDetail> {
  return requestJson<CampaignDetail>(`/campaigns/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
