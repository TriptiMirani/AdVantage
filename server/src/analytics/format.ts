const MICROS_PER_CENT = BigInt(10_000);

// Null, not 0, when there are no impressions: a zero-impression CTR is undefined, not zero.
export function ctr(clicks: number, impressions: number): number | null {
  return impressions === 0 ? null : clicks / impressions;
}

// Spend is converted to cents once, on the total, so rounding does not add up campaign by campaign.
// Can be negative when the total has overspent by up to one flush window of events.
export function remainingCents(budgetCents: number, spentMicros: bigint): number {
  return budgetCents - Number(spentMicros / MICROS_PER_CENT);
}

// Micros go out as a string because JSON cannot carry BigInt. Cents are derived, rounded down.
export function formatSpend(spendMicros: bigint): { spendMicros: string; spendCents: number } {
  return {
    spendMicros: spendMicros.toString(),
    spendCents: Number(spendMicros / MICROS_PER_CENT),
  };
}
