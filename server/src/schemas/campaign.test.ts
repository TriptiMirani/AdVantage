import { test } from "node:test";
import assert from "node:assert/strict";
import { createCampaignSchema, updateCampaignSchema } from "./campaign";

const valid = {
  name: "Fall Sale",
  budgetCents: 500000,
  costPerImpressionMicros: 1500,
  costPerClickCents: 25,
  targetAudience: { region: "US" },
  creativeUrl: "https://example.com/creative.png",
  startDate: "2026-10-01T00:00:00.000Z",
  endDate: "2026-10-31T00:00:00.000Z",
};

test("a complete campaign passes", () => {
  assert.equal(createCampaignSchema.safeParse(valid).success, true);
});

test("endDate before startDate fails on endDate", () => {
  const result = createCampaignSchema.safeParse({ ...valid, endDate: "2026-09-30T00:00:00.000Z" });
  assert.equal(result.success, false);
  assert.deepEqual(result.success ? [] : result.error.issues[0].path, ["endDate"]);
});

test("creativeUrl must be an absolute http or https URL", () => {
  assert.equal(createCampaignSchema.safeParse({ ...valid, creativeUrl: "ftp://example.com/a.png" }).success, false);
  assert.equal(createCampaignSchema.safeParse({ ...valid, creativeUrl: "not a url" }).success, false);
  assert.equal(createCampaignSchema.safeParse({ ...valid, creativeUrl: "http://example.com/a.png" }).success, true);
});

test("targetAudience must be an object, not an array", () => {
  assert.equal(createCampaignSchema.safeParse({ ...valid, targetAudience: [1, 2] }).success, false);
});

test("money must be non-negative whole numbers", () => {
  assert.equal(createCampaignSchema.safeParse({ ...valid, budgetCents: -1 }).success, false);
  assert.equal(createCampaignSchema.safeParse({ ...valid, budgetCents: 10.5 }).success, false);
  assert.equal(createCampaignSchema.safeParse({ ...valid, costPerImpressionMicros: -1 }).success, false);
});

test("an update needs at least one field and applies the same URL rule", () => {
  assert.equal(updateCampaignSchema.safeParse({}).success, false);
  assert.equal(updateCampaignSchema.safeParse({ creativeUrl: "javascript:alert(1)" }).success, false);
  assert.equal(updateCampaignSchema.safeParse({ status: "PAUSED" }).success, true);
});
