import { test } from "node:test";
import assert from "node:assert/strict";
import { commitsInWindow, decideVerification } from "./verify";

const at = (iso: string) => new Date(iso);

test("commits inside a window are counted, with both ends inclusive", () => {
  const start = at("2026-10-04T14:00:00.000Z");
  const end = at("2026-10-04T14:00:30.000Z");
  const commits = [
    at("2026-10-04T13:59:59.999Z"),
    at("2026-10-04T14:00:00.000Z"),
    at("2026-10-04T14:00:15.000Z"),
    at("2026-10-04T14:00:30.000Z"),
    at("2026-10-04T14:00:30.001Z"),
  ];
  assert.equal(commitsInWindow(commits, start, end).length, 3);
});

test("no commits gives an empty result", () => {
  const window = commitsInWindow([], at("2026-10-04T14:00:00.000Z"), at("2026-10-04T14:00:30.000Z"));
  assert.deepEqual(window, []);
});

test("a clean run passes when both checks match", () => {
  assert.deepEqual(decideVerification(0, { applicable: true, mismatchCount: 0 }), {
    pass: true,
    redisNote: "pass",
  });
});

test("a Redis mismatch fails the run when no flush happened during the steps", () => {
  const verdict = decideVerification(0, { applicable: true, mismatchCount: 50 });
  assert.equal(verdict.pass, false);
  assert.equal(verdict.redisNote, "FAIL (50 mismatches)");
});

test("a Redis mismatch does not fail the run when a flush happened during the steps", () => {
  const verdict = decideVerification(0, { applicable: false, mismatchCount: 50 });
  assert.equal(verdict.pass, true);
  assert.equal(verdict.redisNote, "not applicable: worker flushed during the run");
});

test("a Postgres mismatch fails the run even when Redis is not applicable", () => {
  assert.equal(decideVerification(3, { applicable: false, mismatchCount: 0 }).pass, false);
});
