export type StatType = "impression" | "click";

// Safety net: a counter nobody flushes disappears after a day.
export const STAT_TTL_SECONDS = 86400;

// UTC on purpose: the worker and the Postgres buckets use UTC hours too.
export function hourBucket(at: Date): string {
  const yyyy = at.getUTCFullYear();
  const mm = String(at.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(at.getUTCDate()).padStart(2, "0");
  const hh = String(at.getUTCHours()).padStart(2, "0");
  return `${yyyy}${mm}${dd}${hh}`;
}

export function statKey(input: { campaignId: string; type: StatType; at: Date }): string {
  return `stats:${input.campaignId}:${hourBucket(input.at)}:${input.type}`;
}

// Counters are renamed to flushing:{batchId}:stats:... before they are read, so a failed flush can be replayed.
const STAGED_PREFIX = "flushing:";

export function stagedKey(batchId: string, key: string): string {
  return `${STAGED_PREFIX}${batchId}:${key}`;
}

export function parseStagedKey(key: string): { batchId: string; statKey: string } | null {
  if (!key.startsWith(STAGED_PREFIX)) return null;
  const rest = key.slice(STAGED_PREFIX.length);
  const separator = rest.indexOf(":");
  if (separator <= 0) return null;
  const batchId = rest.slice(0, separator);
  const statKey = rest.slice(separator + 1);
  if (!statKey.startsWith("stats:")) return null;
  return { batchId, statKey };
}

export type ParsedStatKey = { campaignId: string; hourBucket: Date; type: StatType };

// Returns null for anything statKey could not have produced. The round-trip check rejects
// bucket strings like month 13, which Date.UTC would silently roll over.
export function parseStatKey(key: string): ParsedStatKey | null {
  const parts = key.split(":");
  if (parts.length !== 4 || parts[0] !== "stats") return null;

  const [, campaignId, bucket, type] = parts;
  if (campaignId.length === 0) return null;
  if (type !== "impression" && type !== "click") return null;

  const at = new Date(
    Date.UTC(
      Number(bucket.slice(0, 4)),
      Number(bucket.slice(4, 6)) - 1,
      Number(bucket.slice(6, 8)),
      Number(bucket.slice(8, 10)),
    ),
  );
  if (hourBucket(at) !== bucket) return null;

  return { campaignId, hourBucket: at, type };
}
