import { test } from "node:test";
import assert from "node:assert/strict";
import { createFlusher, type CounterStore, type StagedKey } from "./flush";
import type { Aggregation, CampaignCost } from "./aggregate";
import { parseStagedKey, statKey } from "../stats/keys";

const campaignId = "80c0697e-4486-4c85-a1c2-5f8bd55b031b";
const at = new Date("2026-10-03T15:10:00.000Z");
const impressionKey = statKey({ campaignId, type: "impression", at });
const clickKey = statKey({ campaignId, type: "click", at });

const costs = new Map<string, CampaignCost>([
  [campaignId, { id: campaignId, costPerImpressionMicros: 1500, costPerClickCents: 25, budgetCents: 100 }],
]);

// In-memory stand-in for Redis (staged keys and pending counters) plus the Postgres ledger.
type Fake = CounterStore & {
  pending: Map<string, number>;
  values: Map<string, number>;
  ledger: Set<string>;
  writes: Aggregation[];
  faults: { list?: Error; stage?: Error; read?: Error; commit?: Error; delete?: Error };
  holdCommit?: Promise<void>;
};

function fakeStore(): Fake {
  const fake: Fake = {
    pending: new Map(),
    values: new Map(),
    ledger: new Set(),
    writes: [],
    faults: {},
    async listStagedBatches() {
      if (fake.faults.list) throw fake.faults.list;
      const batches = new Map<string, StagedKey[]>();
      for (const stagedKey of fake.values.keys()) {
        const parsed = parseStagedKey(stagedKey);
        if (!parsed) continue;
        const list = batches.get(parsed.batchId) ?? [];
        list.push({ stagedKey, statKey: parsed.statKey });
        batches.set(parsed.batchId, list);
      }
      return batches;
    },
    async stageNewCounters(batchId) {
      if (fake.faults.stage) throw fake.faults.stage;
      const staged: StagedKey[] = [];
      for (const [key, value] of fake.pending) {
        const stagedKey = `flushing:${batchId}:${key}`;
        fake.values.set(stagedKey, value);
        staged.push({ stagedKey, statKey: key });
      }
      fake.pending.clear();
      return staged;
    },
    async readCounters(staged) {
      if (fake.faults.read) throw fake.faults.read;
      return staged.flatMap((entry) => {
        const value = fake.values.get(entry.stagedKey);
        return value === undefined ? [] : [{ stagedKey: entry.stagedKey, key: entry.statKey, value }];
      });
    },
    async isBatchCommitted(batchId) {
      return fake.ledger.has(batchId);
    },
    async findCampaignCosts() {
      return costs;
    },
    async commitBatch(batchId, aggregation) {
      if (fake.holdCommit) await fake.holdCommit;
      if (fake.faults.commit) throw fake.faults.commit;
      fake.ledger.add(batchId);
      fake.writes.push(aggregation);
    },
    async deleteStaged(stagedKeys) {
      if (fake.faults.delete) throw fake.faults.delete;
      for (const key of stagedKeys) fake.values.delete(key);
    },
  };
  return fake;
}

function silentLogger() {
  const entries: { level: string; message: string }[] = [];
  const record = (level: string) => (message: string) => {
    entries.push({ level, message });
  };
  return {
    entries,
    logger: { info: record("info"), warn: record("warn"), error: record("error") },
  };
}

function sequentialIds(): () => string {
  let n = 0;
  return () => `batch-${++n}`;
}

test("a successful flush writes once, records the ledger, and clears staged keys", async () => {
  const store = fakeStore();
  store.pending.set(impressionKey, 20);
  store.pending.set(clickKey, 5);
  const { logger } = silentLogger();

  const status = await createFlusher(store, logger, sequentialIds()).flushOnce();

  assert.equal(status, "written");
  assert.equal(store.writes.length, 1);
  assert.equal(store.writes[0].hourly[0].spendMicros, 1_280_000);
  assert.deepEqual([...store.ledger], ["batch-1"]);
  assert.equal(store.values.size, 0);
});

test("a failed commit keeps counters staged, and the next tick replays them exactly once", async () => {
  const store = fakeStore();
  store.pending.set(impressionKey, 3);
  store.faults.commit = new Error("db down");
  const { logger } = silentLogger();
  const flusher = createFlusher(store, logger, sequentialIds());

  assert.equal(await flusher.flushOnce(), "retry_later");
  assert.equal(store.values.size, 1, "counters must still be staged");
  assert.equal(store.ledger.size, 0);

  store.faults.commit = undefined;
  assert.equal(await flusher.flushOnce(), "written");
  assert.equal(store.writes.length, 1);
  assert.equal(store.writes[0].hourly[0].impressions, 3);
  assert.equal(store.values.size, 0);
});

test("a batch already in the ledger is cleared without being written again", async () => {
  const store = fakeStore();
  store.ledger.add("already-committed");
  store.values.set(`flushing:already-committed:${impressionKey}`, 5);
  const { logger } = silentLogger();

  const status = await createFlusher(store, logger, sequentialIds()).flushOnce();

  assert.equal(status, "empty");
  assert.equal(store.writes.length, 0, "a committed batch must never be written twice");
  assert.equal(store.values.size, 0);
});

test("if clearing keys fails after commit, the next tick clears them without writing again", async () => {
  const store = fakeStore();
  store.pending.set(impressionKey, 2);
  store.faults.delete = new Error("redis blip");
  const { logger } = silentLogger();
  const flusher = createFlusher(store, logger, sequentialIds());

  assert.equal(await flusher.flushOnce(), "written");
  assert.equal(store.writes.length, 1);
  assert.equal(store.values.size, 1, "the staged key is still there");

  store.faults.delete = undefined;
  await flusher.flushOnce();
  assert.equal(store.writes.length, 1, "no second write");
  assert.equal(store.values.size, 0);
});

test("counters for deleted campaigns are cleared but never written", async () => {
  const store = fakeStore();
  const orphanKey = statKey({ campaignId: "00000000-0000-4000-8000-000000000000", type: "click", at });
  store.pending.set(impressionKey, 3);
  store.pending.set(orphanKey, 9);
  const { logger } = silentLogger();

  await createFlusher(store, logger, sequentialIds()).flushOnce();

  assert.equal(store.writes.length, 1);
  assert.equal(store.writes[0].hourly.length, 1);
  assert.equal(store.writes[0].hourly[0].campaignId, campaignId);
  assert.equal(store.values.size, 0);
});

test("a failed read keeps counters staged for retry", async () => {
  const store = fakeStore();
  store.pending.set(impressionKey, 4);
  store.faults.read = new Error("redis timeout");
  const { logger } = silentLogger();
  const flusher = createFlusher(store, logger, sequentialIds());

  assert.equal(await flusher.flushOnce(), "retry_later");
  assert.equal(store.values.size, 1);

  store.faults.read = undefined;
  assert.equal(await flusher.flushOnce(), "written");
  assert.equal(store.writes[0].hourly[0].impressions, 4);
});

test("a failure while staging aborts without writing", async () => {
  const store = fakeStore();
  store.pending.set(impressionKey, 1);
  store.faults.stage = new Error("redis down");
  const { logger } = silentLogger();

  assert.equal(await createFlusher(store, logger, sequentialIds()).flushOnce(), "aborted");
  assert.equal(store.writes.length, 0);
});

test("a flush started while one is running is skipped", async () => {
  const store = fakeStore();
  store.pending.set(impressionKey, 1);
  let release!: () => void;
  store.holdCommit = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { logger } = silentLogger();
  const flusher = createFlusher(store, logger, sequentialIds());

  const first = flusher.flushOnce();
  assert.equal(await flusher.flushOnce(), "skipped");

  release();
  assert.equal(await first, "written");
});

test("idle resolves only after the flush in progress has finished", async () => {
  const store = fakeStore();
  store.pending.set(impressionKey, 1);
  let release!: () => void;
  store.holdCommit = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { logger } = silentLogger();
  const flusher = createFlusher(store, logger, sequentialIds());

  void flusher.flushOnce();
  let idleDone = false;
  const idle = flusher.idle().then(() => {
    idleDone = true;
  });
  await Promise.resolve();
  assert.equal(idleDone, false);

  release();
  await idle;
  assert.equal(idleDone, true);
  assert.equal(store.writes.length, 1);
});
