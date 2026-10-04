import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate, type CampaignCost } from "./aggregate";
import { statKey } from "../stats/keys";

const campaignId = "80c0697e-4486-4c85-a1c2-5f8bd55b031b";
const costs = new Map<string, CampaignCost>([
  [
    campaignId,
    { id: campaignId, costPerImpressionMicros: 1500, costPerClickCents: 25, budgetCents: 100 },
  ],
]);

const at15 = new Date("2026-10-03T15:10:00.000Z");
const at23 = new Date("2026-10-03T23:10:00.000Z");

test("sums many counters for one campaign-hour into one row with exact micros", () => {
  const result = aggregate(
    [
      { key: statKey({ campaignId, type: "impression", at: at15 }), value: 20 },
      { key: statKey({ campaignId, type: "click", at: at15 }), value: 5 },
    ],
    costs,
  );

  assert.deepEqual(result.hourly, [
    {
      campaignId,
      hourBucket: new Date("2026-10-03T15:00:00.000Z"),
      impressions: 20,
      clicks: 5,
      spendMicros: 1_280_000,
    },
  ]);
  assert.deepEqual(result.campaigns, [{ campaignId, spendMicros: 1_280_000, budgetCents: 100 }]);
});

test("daily row is the sum of the campaign's hours on that UTC day", () => {
  const result = aggregate(
    [
      { key: statKey({ campaignId, type: "impression", at: at15 }), value: 20 },
      { key: statKey({ campaignId, type: "click", at: at15 }), value: 5 },
      { key: statKey({ campaignId, type: "impression", at: at23 }), value: 3 },
    ],
    costs,
  );

  assert.equal(result.hourly.length, 2);
  assert.deepEqual(result.daily, [
    {
      campaignId,
      dayBucket: new Date("2026-10-03T00:00:00.000Z"),
      impressions: 23,
      clicks: 5,
      spendMicros: 1_284_500,
    },
  ]);
});

test("a single low-cost impression keeps its full value instead of rounding to zero", () => {
  const result = aggregate(
    [{ key: statKey({ campaignId, type: "impression", at: at15 }), value: 1 }],
    costs,
  );
  assert.equal(result.hourly[0].spendMicros, 1500);
  assert.equal(result.campaigns[0].spendMicros, 1500);
});

test("drops malformed keys and counters for deleted campaigns without marking them used", () => {
  const unknownCampaign = "00000000-0000-4000-8000-000000000000";
  const orphan = { key: statKey({ campaignId: unknownCampaign, type: "click", at: at15 }), value: 2 };
  const malformed = { key: "stats:garbage", value: 1 };
  const valid = { key: statKey({ campaignId, type: "click", at: at15 }), value: 1 };

  const result = aggregate([orphan, malformed, valid], costs);

  assert.deepEqual(result.dropped, [orphan, malformed]);
  assert.deepEqual(result.used, [valid]);
  assert.equal(result.hourly.length, 1);
});
