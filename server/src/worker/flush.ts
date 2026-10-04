import { randomUUID } from "node:crypto";
import { aggregate, type Aggregation, type CampaignCost, type RawCounter } from "./aggregate";
import { parseStatKey } from "../stats/keys";

export type StagedKey = { stagedKey: string; statKey: string };
export type StagedCounter = { stagedKey: string; key: string; value: number };

export type CounterStore = {
  // Staged batches left behind by earlier ticks or crashed runs, grouped by batch id.
  listStagedBatches(): Promise<Map<string, StagedKey[]>>;
  // Atomically renames every stats counter into this batch. Counters that arrive later are picked up by the next tick.
  stageNewCounters(batchId: string): Promise<StagedKey[]>;
  // Missing (expired) counters are skipped.
  readCounters(staged: StagedKey[]): Promise<StagedCounter[]>;
  isBatchCommitted(batchId: string): Promise<boolean>;
  findCampaignCosts(campaignIds: string[]): Promise<Map<string, CampaignCost>>;
  // Writes the aggregation and the batch's ledger row in one transaction.
  commitBatch(batchId: string, aggregation: Aggregation): Promise<void>;
  deleteStaged(stagedKeys: string[]): Promise<void>;
};

export type FlushStatus = "empty" | "written" | "retry_later" | "aborted" | "skipped";

type Logger = Pick<Console, "info" | "warn" | "error">;

export type Flusher = {
  flushOnce(): Promise<FlushStatus>;
  // Resolves when the flush in progress, if any, has finished.
  idle(): Promise<void>;
};

export function createFlusher(
  store: CounterStore,
  logger: Logger,
  newBatchId: () => string = randomUUID,
): Flusher {
  let inFlight: Promise<FlushStatus> | null = null;

  // Returns "retry_later" if the commit fails. The staged keys stay in Redis for the next tick.
  async function processBatch(batchId: string, staged: StagedKey[]): Promise<"written" | "retry_later"> {
    let aggregation: Aggregation;
    try {
      const counters: RawCounter[] = (await store.readCounters(staged)).map((c) => ({
        key: c.key,
        value: c.value,
      }));
      const campaignIds = [
        ...new Set(counters.flatMap((counter) => {
          const parsed = parseStatKey(counter.key);
          return parsed ? [parsed.campaignId] : [];
        })),
      ];
      const costs = await store.findCampaignCosts(campaignIds);
      aggregation = aggregate(counters, costs);
    } catch (err) {
      logger.error(`batch ${batchId}: could not read or price counters; kept for retry`, errorMessage(err));
      return "retry_later";
    }

    if (aggregation.dropped.length > 0) {
      logger.warn(
        `batch ${batchId}: dropped ${aggregation.dropped.length} counter(s) for deleted campaigns or malformed keys`,
        aggregation.dropped.map((counter) => counter.key),
      );
    }

    try {
      await store.commitBatch(batchId, aggregation);
    } catch (err) {
      logger.error(`batch ${batchId}: commit failed; counters kept in Redis for retry`, errorMessage(err));
      return "retry_later";
    }

    // Safe to fail here: the ledger row exists, so a later tick deletes these keys without writing again.
    try {
      await store.deleteStaged(staged.map((s) => s.stagedKey));
    } catch (err) {
      logger.warn(`batch ${batchId}: committed; staged keys will be cleared on the next tick`, errorMessage(err));
    }

    logger.info(
      `batch ${batchId}: committed ${aggregation.used.length} counter(s) into ${aggregation.hourly.length} row(s)`,
    );
    return "written";
  }

  async function run(): Promise<FlushStatus> {
    let wrote = false;

    let leftovers: Map<string, StagedKey[]>;
    try {
      leftovers = await store.listStagedBatches();
    } catch (err) {
      logger.error("flush aborted: could not list staged counters", errorMessage(err));
      return "aborted";
    }

    for (const [batchId, staged] of leftovers) {
      let committed: boolean;
      try {
        committed = await store.isBatchCommitted(batchId);
      } catch (err) {
        logger.error(`batch ${batchId}: could not check the ledger; kept for retry`, errorMessage(err));
        return "retry_later";
      }

      if (committed) {
        // The commit happened before a crash, so only the cleanup is missing. Writing again would double-count.
        try {
          await store.deleteStaged(staged.map((s) => s.stagedKey));
          logger.info(`batch ${batchId}: already committed; cleared ${staged.length} leftover key(s)`);
        } catch (err) {
          logger.warn(`batch ${batchId}: already committed; cleanup retried next tick`, errorMessage(err));
        }
        continue;
      }

      if ((await processBatch(batchId, staged)) === "retry_later") {
        return "retry_later";
      }
      wrote = true;
    }

    const batchId = newBatchId();
    let staged: StagedKey[];
    try {
      staged = await store.stageNewCounters(batchId);
    } catch (err) {
      // Anything already renamed is a leftover batch, so the next tick replays it.
      logger.error("flush aborted: could not stage counters", errorMessage(err));
      return "aborted";
    }
    if (staged.length === 0) {
      return wrote ? "written" : "empty";
    }

    if ((await processBatch(batchId, staged)) === "retry_later") {
      return "retry_later";
    }
    return "written";
  }

  return {
    flushOnce() {
      if (inFlight) {
        logger.warn("previous flush still running; skipping this tick");
        return Promise.resolve("skipped");
      }
      inFlight = run()
        .catch((err: unknown): FlushStatus => {
          logger.error("flush crashed", errorMessage(err));
          return "aborted";
        })
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
    async idle() {
      if (inFlight) {
        await inFlight;
      }
    },
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
