import { test } from "node:test";
import assert from "node:assert/strict";
import { createStatusCache } from "./campaignStatusCache";

function fakeLookup(values: Record<string, string>) {
  const calls: string[] = [];
  const lookup = async (campaignId: string) => {
    calls.push(campaignId);
    return values[campaignId] ?? null;
  };
  return { lookup, calls };
}

test("serves a cached value within the TTL without another lookup", async () => {
  const { lookup, calls } = fakeLookup({ a: "ACTIVE" });
  let clock = 0;
  const get = createStatusCache({ lookup, ttlMs: 5000, maxEntries: 10, now: () => clock });

  assert.equal(await get("a"), "ACTIVE");
  clock = 4999;
  assert.equal(await get("a"), "ACTIVE");
  assert.deepEqual(calls, ["a"]);
});

test("looks up again once the TTL has expired", async () => {
  const { lookup, calls } = fakeLookup({ a: "ACTIVE" });
  let clock = 0;
  const get = createStatusCache({ lookup, ttlMs: 5000, maxEntries: 10, now: () => clock });

  await get("a");
  clock = 5000;
  await get("a");
  assert.deepEqual(calls, ["a", "a"]);
});

test("caches a missing campaign so it is looked up only once", async () => {
  const { lookup, calls } = fakeLookup({});
  const get = createStatusCache({ lookup, ttlMs: 5000, maxEntries: 10, now: () => 0 });

  assert.equal(await get("missing"), null);
  assert.equal(await get("missing"), null);
  assert.deepEqual(calls, ["missing"]);
});

test("clears all entries when full, so an earlier key is looked up again", async () => {
  const { lookup, calls } = fakeLookup({ a: "ACTIVE", b: "ACTIVE", c: "ACTIVE" });
  const get = createStatusCache({ lookup, ttlMs: 5000, maxEntries: 2, now: () => 0 });

  await get("a");
  await get("b");
  await get("c");
  await get("a");
  assert.deepEqual(calls, ["a", "b", "c", "a"]);
});
