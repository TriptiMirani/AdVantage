import { test } from "node:test";
import assert from "node:assert/strict";
import { ctr, formatSpend, remainingCents } from "./format";
import {
  campaignsQuerySchema,
  isRealDay,
  summaryQuerySchema,
  timeseriesQuerySchema,
} from "../schemas/analytics";

test("isRealDay rejects impossible calendar dates", () => {
  assert.equal(isRealDay("2026-02-28"), true);
  assert.equal(isRealDay("2026-02-29"), false, "2026 is not a leap year");
  assert.equal(isRealDay("2028-02-29"), true);
  assert.equal(isRealDay("2026-13-01"), false);
});

test("summary requires from <= to and accepts a valid range", () => {
  assert.equal(summaryQuerySchema.safeParse({ from: "2026-09-10", to: "2026-09-01" }).success, false);
  assert.equal(summaryQuerySchema.safeParse({ from: "2026-09-01", to: "2026-09-01" }).success, true);
  assert.equal(summaryQuerySchema.safeParse({ from: "2026-9-1", to: "2026-09-01" }).success, false, "needs YYYY-MM-DD");
});

test("summary caps the range at 366 days inclusive", () => {
  assert.equal(summaryQuerySchema.safeParse({ from: "2026-01-01", to: "2026-12-31" }).success, true, "365 days");
  assert.equal(summaryQuerySchema.safeParse({ from: "2026-01-01", to: "2027-01-01" }).success, true, "366 days");
  assert.equal(summaryQuerySchema.safeParse({ from: "2026-01-01", to: "2027-01-02" }).success, false, "367 days");
});

test("hourly timeseries caps the range at 7 days, daily at 366", () => {
  assert.equal(
    timeseriesQuerySchema.safeParse({ from: "2026-09-01", to: "2026-09-07", granularity: "hour" }).success,
    true,
  );
  assert.equal(
    timeseriesQuerySchema.safeParse({ from: "2026-09-01", to: "2026-09-08", granularity: "hour" }).success,
    false,
  );
  assert.equal(
    timeseriesQuerySchema.safeParse({ from: "2026-01-01", to: "2026-09-08" }).data?.granularity,
    "day",
    "granularity defaults to day",
  );
});

test("campaigns defaults and bounds the page size", () => {
  const parsed = campaignsQuerySchema.parse({ from: "2026-09-01", to: "2026-09-30" });
  assert.equal(parsed.limit, 20);
  assert.equal(parsed.offset, 0);
  assert.equal(parsed.sort, "spend");
  assert.equal(
    campaignsQuerySchema.safeParse({ from: "2026-09-01", to: "2026-09-30", limit: "101" }).success,
    false,
  );
  assert.equal(
    campaignsQuerySchema.safeParse({ from: "2026-09-01", to: "2026-09-30", sort: "ctr" }).success,
    false,
    "only spend, impressions and clicks can sort",
  );
});

test("ctr is null with no impressions, otherwise clicks over impressions", () => {
  assert.equal(ctr(0, 0), null);
  assert.equal(ctr(5, 20), 0.25);
});

test("remaining budget converts spend to cents once, and can go negative", () => {
  assert.equal(remainingCents(100, BigInt(1_280_000)), 100 - 128);
  assert.equal(remainingCents(100, BigInt(1_005_000)), 100 - 100, "100.5 cents spent rounds down to 100");
  assert.equal(remainingCents(10, BigInt(150_000)), -5, "overspend shows as negative");
});

test("spend is exact micros as a string, with whole cents rounded down", () => {
  assert.deepEqual(formatSpend(BigInt(1_280_000)), { spendMicros: "1280000", spendCents: 128 });
  assert.deepEqual(formatSpend(BigInt(19_999)), { spendMicros: "19999", spendCents: 1 });
});
