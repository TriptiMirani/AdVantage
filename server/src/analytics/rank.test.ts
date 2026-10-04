import { test } from "node:test";
import assert from "node:assert/strict";
import { rankCampaigns, type CampaignInfo, type RangeSums } from "./rank";

function campaign(id: string, name: string): CampaignInfo {
  return { id, name, status: "ACTIVE", budgetCents: 1000, spentMicros: BigInt(0) };
}

const campaigns = [
  campaign("c-idle-b", "Beta"),
  campaign("c-active-low", "Alpha"),
  campaign("c-active-high", "Gamma"),
  campaign("c-active-tie-z", "Zeta"),
  campaign("c-active-tie-a", "Epsilon"),
];

const sums = new Map<string, RangeSums>([
  ["c-active-low", { impressions: 10, clicks: 1, spendMicros: BigInt(100) }],
  ["c-active-high", { impressions: 50, clicks: 9, spendMicros: BigInt(900) }],
  ["c-active-tie-z", { impressions: 20, clicks: 2, spendMicros: BigInt(300) }],
  ["c-active-tie-a", { impressions: 20, clicks: 2, spendMicros: BigInt(300) }],
]);

test("active campaigns rank by spend, idle campaigns come last", () => {
  const { rows, total } = rankCampaigns(campaigns, sums, { sort: "spend", offset: 0, limit: 10 });
  assert.equal(total, 5);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["c-active-high", "c-active-tie-a", "c-active-tie-z", "c-active-low", "c-idle-b"],
  );
  assert.equal(rows[4].hasActivity, false);
});

test("an idle campaign never ranks above an active one, even when the metric is zero for the active one", () => {
  const onlyImpressions = new Map<string, RangeSums>([
    ["c-active-low", { impressions: 5, clicks: 0, spendMicros: BigInt(0) }],
  ]);
  const { rows } = rankCampaigns(campaigns, onlyImpressions, { sort: "clicks", offset: 0, limit: 10 });
  assert.equal(rows[0].id, "c-active-low");
  assert.equal(rows[1].hasActivity, false);
});

test("ties break on name, then id", () => {
  const { rows } = rankCampaigns(campaigns, sums, { sort: "impressions", offset: 0, limit: 10 });
  const tied = rows.filter((row) => row.id === "c-active-tie-a" || row.id === "c-active-tie-z");
  assert.deepEqual(tied.map((row) => row.name), ["Epsilon", "Zeta"]);
});

test("q filters by name, case-insensitively, and total reflects the filter", () => {
  const { rows, total } = rankCampaigns(campaigns, sums, { sort: "spend", q: "  ALPH ", offset: 0, limit: 10 });
  assert.equal(total, 1);
  assert.equal(rows[0].name, "Alpha");
});

test("pagination slices the ranked list and total counts every match", () => {
  const first = rankCampaigns(campaigns, sums, { sort: "spend", offset: 0, limit: 2 });
  const second = rankCampaigns(campaigns, sums, { sort: "spend", offset: 2, limit: 2 });
  const last = rankCampaigns(campaigns, sums, { sort: "spend", offset: 4, limit: 2 });
  assert.equal(first.total, 5);
  assert.deepEqual(first.rows.map((row) => row.id), ["c-active-high", "c-active-tie-a"]);
  assert.deepEqual(second.rows.map((row) => row.id), ["c-active-tie-z", "c-active-low"]);
  assert.deepEqual(last.rows.map((row) => row.id), ["c-idle-b"]);
});
