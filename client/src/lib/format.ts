const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-US");
const usdWhole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdFull = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

// Axis labels: 1.2K, 3.4M.
export function formatCompact(value: number): string {
  return compact.format(value);
}

// Tooltips and table cells: full digits.
export function formatFull(value: number): string {
  return full.format(value);
}

export function formatCents(cents: number): string {
  return usdFull.format(cents / 100);
}

export function formatCentsWhole(cents: number): string {
  return usdWhole.format(cents / 100);
}

export function formatPercent(ratio: number | null): string {
  return ratio === null ? "—" : `${(ratio * 100).toFixed(2)}%`;
}

// Signed change for KPI deltas. Returns null when the base is zero, because a percent change is undefined there.
export function formatDelta(current: number, previous: number): string | null {
  if (previous === 0) return null;
  const change = ((current - previous) / previous) * 100;
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}
