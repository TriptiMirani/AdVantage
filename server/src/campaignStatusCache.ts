type Entry<T> = { value: T | null; expiresAt: number };

export type StatusCacheOptions<T> = {
  lookup: (campaignId: string) => Promise<T | null>;
  ttlMs: number;
  // Bounds memory when clients send many distinct unknown ids. Clearing is crude but safe: the next lookups just go to the database.
  maxEntries: number;
  now?: () => number;
};

// Misses (null) are cached too, so random ids cannot force one database query per event.
export function createStatusCache<T>({ lookup, ttlMs, maxEntries, now = Date.now }: StatusCacheOptions<T>) {
  const entries = new Map<string, Entry<T>>();

  return async function getStatus(campaignId: string): Promise<T | null> {
    const current = now();
    const hit = entries.get(campaignId);
    if (hit && hit.expiresAt > current) {
      return hit.value;
    }

    const value = await lookup(campaignId);
    if (entries.size >= maxEntries) {
      entries.clear();
    }
    entries.set(campaignId, { value, expiresAt: current + ttlMs });
    return value;
  };
}
