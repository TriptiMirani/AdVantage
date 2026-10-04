import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStagedKey, parseStatKey, stagedKey, statKey } from "./keys";

const campaignId = "436f3ccb-3b9c-4990-a191-b085f3f60527";

test("uses the UTC hour for the bucket", () => {
  assert.equal(
    statKey({ campaignId, type: "impression", at: new Date("2026-10-03T14:59:59.999Z") }),
    `stats:${campaignId}:2026100314:impression`,
  );
});

test("rolls over to the next hour at the UTC boundary", () => {
  assert.equal(
    statKey({ campaignId, type: "click", at: new Date("2026-10-03T15:00:00.000Z") }),
    `stats:${campaignId}:2026100315:click`,
  );
});

test("rolls over to the next day at midnight UTC", () => {
  assert.equal(
    statKey({ campaignId, type: "impression", at: new Date("2026-10-03T23:59:59.999Z") }),
    `stats:${campaignId}:2026100323:impression`,
  );
  assert.equal(
    statKey({ campaignId, type: "impression", at: new Date("2026-10-04T00:00:00.000Z") }),
    `stats:${campaignId}:2026100400:impression`,
  );
});

test("zero-pads single-digit month, day and hour", () => {
  assert.equal(
    statKey({ campaignId, type: "click", at: new Date("2026-01-02T03:00:00.000Z") }),
    `stats:${campaignId}:2026010203:click`,
  );
});

test("parseStatKey reverses statKey", () => {
  const key = statKey({ campaignId, type: "click", at: new Date("2026-10-03T15:42:00.000Z") });
  assert.deepEqual(parseStatKey(key), {
    campaignId,
    hourBucket: new Date("2026-10-03T15:00:00.000Z"),
    type: "click",
  });
});

test("parseStagedKey reverses stagedKey", () => {
  const key = statKey({ campaignId, type: "click", at: new Date("2026-10-03T15:42:00.000Z") });
  assert.deepEqual(parseStagedKey(stagedKey("batch-1", key)), { batchId: "batch-1", statKey: key });
});

test("parseStagedKey rejects keys that are not staged counters", () => {
  assert.equal(parseStagedKey(`stats:${campaignId}:2026100315:click`), null);
  assert.equal(parseStagedKey("flushing:batch-1"), null);
  assert.equal(parseStagedKey("flushing::stats:x"), null);
  assert.equal(parseStagedKey("flushing:batch-1:other:thing"), null);
});

test("parseStatKey rejects keys statKey could not have produced", () => {
  assert.equal(parseStatKey("other:thing"), null);
  assert.equal(parseStatKey(`stats:${campaignId}:2026100315:view`), null);
  assert.equal(parseStatKey(`stats:${campaignId}:2026130315:click`), null, "month 13");
  assert.equal(parseStatKey(`stats:${campaignId}:2026100325:click`), null, "hour 25");
  assert.equal(parseStatKey(`stats::2026100315:click`), null, "empty campaign id");
});
