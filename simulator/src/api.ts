// Costs are set on every load-test campaign, so the expected spend can be computed from the tally.
export const COST = { perImpressionMicros: 1500, perClickCents: 25 } as const;

const BASE_URL = "http://localhost:3001";

export async function createLoadCampaigns(runTag: string, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 1; index <= count; index += 1) {
    const response = await fetch(`${BASE_URL}/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Load Test ${runTag} ${String(index).padStart(2, "0")}`,
        status: "ACTIVE",
        // Large enough that no load campaign reaches its budget during the benchmark.
        budgetCents: 2_000_000_000,
        costPerImpressionMicros: COST.perImpressionMicros,
        costPerClickCents: COST.perClickCents,
        targetAudience: { region: "US" },
        creativeUrl: "https://example.com/load.png",
        startDate: "2026-10-01T00:00:00.000Z",
        endDate: "2026-12-31T00:00:00.000Z",
      }),
    });
    if (!response.ok) {
      throw new Error(`creating load campaign ${index} failed with HTTP ${response.status}`);
    }
    const body = (await response.json()) as { id: string };
    ids.push(body.id);
  }
  return ids;
}

export async function fetchAnalyticsSample(): Promise<{ latencyMs: number; ok: boolean }[]> {
  const urls = [
    `${BASE_URL}/analytics/summary?from=2026-09-01&to=2026-09-30`,
    `${BASE_URL}/analytics/campaigns?from=2026-09-01&to=2026-09-30&sort=spend&limit=20`,
  ];
  const results: { latencyMs: number; ok: boolean }[] = [];
  for (const url of urls) {
    const started = performance.now();
    const response = await fetch(url);
    await response.arrayBuffer();
    results.push({ latencyMs: performance.now() - started, ok: response.ok });
  }
  return results;
}
