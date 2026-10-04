export type DateRange = { from: string; to: string };

const DAY_MS = 86_400_000;

// All ranges are UTC calendar days, both ends inclusive.
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDay(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

export function addDays(day: string, days: number): string {
  return utcDay(new Date(parseDay(day) + days * DAY_MS));
}

export function inclusiveDays(range: DateRange): number {
  return (parseDay(range.to) - parseDay(range.from)) / DAY_MS + 1;
}

// The 30 days ending today, so today - 29 through today.
export function lastThirtyDays(now: Date = new Date()): DateRange {
  const to = utcDay(now);
  return { from: addDays(to, -29), to };
}

export function lastSevenDays(now: Date = new Date()): DateRange {
  const to = utcDay(now);
  return { from: addDays(to, -6), to };
}

export const SEPTEMBER_2026: DateRange = { from: "2026-09-01", to: "2026-09-30" };

// The same number of days, immediately before the given range.
export function previousRange(range: DateRange): DateRange {
  const days = inclusiveDays(range);
  const to = addDays(range.from, -1);
  return { from: addDays(to, -(days - 1)), to };
}

// Hourly for ranges of 7 days or less, daily for longer, matching the server's caps.
export function granularityFor(range: DateRange): "day" | "hour" {
  return inclusiveDays(range) <= 7 ? "hour" : "day";
}

// Every bucket start in the range, so the chart has no gaps. Missing buckets are zeros, not holes.
export function bucketStarts(range: DateRange, granularity: "day" | "hour"): string[] {
  if (granularity === "day") {
    return Array.from({ length: inclusiveDays(range) }, (_, i) => `${addDays(range.from, i)}T00:00:00.000Z`);
  }
  const starts: string[] = [];
  const end = parseDay(range.to) + DAY_MS;
  for (let t = parseDay(range.from); t < end; t += 3_600_000) {
    starts.push(new Date(t).toISOString());
  }
  return starts;
}

// Compares the API's bucket timestamps with the generated starts.
export function bucketKey(iso: string): string {
  return new Date(iso).toISOString();
}
