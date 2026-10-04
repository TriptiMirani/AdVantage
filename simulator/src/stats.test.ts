import { test } from "node:test";
import assert from "node:assert/strict";
import { percentile, summarize } from "./stats";

test("nearest-rank percentiles on a known list", () => {
  const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(percentile(sorted, 50), 50);
  assert.equal(percentile(sorted, 95), 95);
  assert.equal(percentile(sorted, 99), 99);
  assert.equal(percentile(sorted, 100), 100);
});

test("a single value is every percentile", () => {
  assert.equal(percentile([7], 50), 7);
  assert.equal(percentile([7], 99), 7);
});

test("summarize sorts before measuring and reports max", () => {
  const summary = summarize([30, 10, 20]);
  assert.deepEqual(summary, { count: 3, p50: 20, p95: 30, p99: 30, max: 30 });
});

test("an empty sample reports NaN, not zero", () => {
  const summary = summarize([]);
  assert.equal(summary.count, 0);
  assert.ok(Number.isNaN(summary.p50));
});
