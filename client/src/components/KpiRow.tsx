import type { PollState } from "../hooks/usePolling";
import { formatCentsWhole, formatCompact, formatDelta, formatFull, formatPercent } from "../lib/format";
import type { SummaryResponse } from "../types";
import { EmptyState, ErrorState, Skeleton, StaleNotice } from "./states";

type Status = "loading" | "error" | "empty" | "ready";
type Direction = "up" | "down" | "flat";

type Delta = { text: string; direction: Direction } | null;

type CardProps = {
  label: string;
  value: string;
  status: Status;
  delta?: Delta;
  hint: string;
  onRetry: () => void;
  errorMessage?: string;
};

const DELTA_STYLE: Record<Direction, string> = {
  up: "text-positive",
  down: "text-negative",
  flat: "text-muted",
};

const DELTA_MARK: Record<Direction, string> = {
  up: "▲",
  down: "▼",
  flat: "■",
};

function KpiCard({ label, value, status, delta, hint, onRetry, errorMessage }: CardProps) {
  return (
    <section aria-label={label} className="flex min-h-28 flex-col gap-1 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted">{label}</h2>
      {status === "loading" && <Skeleton className="mt-2 h-8 w-32" />}
      {status === "error" && <ErrorState message={errorMessage ?? ""} onRetry={onRetry} />}
      {status === "empty" && <EmptyState>No data for this range</EmptyState>}
      {status === "ready" && (
        <>
          <p className="text-2xl font-semibold tabular-nums text-text">{value}</p>
          <div className="flex flex-wrap items-baseline gap-2 text-xs">
            {delta && (
              <span className={DELTA_STYLE[delta.direction]}>
                {DELTA_MARK[delta.direction]} {delta.text} vs previous period
              </span>
            )}
            <span className="text-muted">{hint}</span>
          </div>
        </>
      )}
    </section>
  );
}

type Props = {
  summary: PollState<SummaryResponse>;
  previous: PollState<SummaryResponse>;
};

export function KpiRow({ summary, previous }: Props) {
  const data = summary.data;
  const prev = previous.data;
  const current = statusOf(summary);
  const emptyRange = data !== null && data.impressions === 0 && data.clicks === 0 && data.spendCents === 0;
  const status: Status = emptyRange ? "empty" : current;

  const retry = () => {
    summary.retry();
    previous.retry();
  };
  const errorMessage = summary.error?.message;

  const percentDelta = (now: number, before: number): Delta => {
    const text = formatDelta(now, before);
    if (text === null) return null;
    return { text, direction: directionOf(now, before) };
  };

  const impressionsDelta = data && prev ? percentDelta(data.impressions, prev.impressions) : null;
  const clicksDelta = data && prev ? percentDelta(data.clicks, prev.clicks) : null;
  const spendDelta = data && prev ? percentDelta(data.spendCents, prev.spendCents) : null;
  const ctrDelta: Delta =
    data && prev && data.ctr !== null && prev.ctr !== null
      ? ctrChange(data.ctr, prev.ctr)
      : null;

  return (
    <div className="flex flex-col gap-4">
      {summary.error && data && <StaleNotice lastUpdated={summary.lastUpdated} onRetry={retry} />}
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <KpiCard
        label="Impressions"
        value={data ? formatCompact(data.impressions) : "—"}
        status={status}
        delta={impressionsDelta}
        hint={data ? formatFull(data.impressions) : ""}
        onRetry={retry}
        errorMessage={errorMessage}
      />
      <KpiCard
        label="Clicks"
        value={data ? formatCompact(data.clicks) : "—"}
        status={status}
        delta={clicksDelta}
        hint={data ? formatFull(data.clicks) : ""}
        onRetry={retry}
        errorMessage={errorMessage}
      />
      <KpiCard
        label="CTR"
        value={data ? formatPercent(data.ctr) : "—"}
        status={status}
        delta={ctrDelta}
        hint="clicks ÷ impressions"
        onRetry={retry}
        errorMessage={errorMessage}
      />
      <KpiCard
        label="Spend"
        value={data ? formatCentsWhole(data.spendCents) : "—"}
        status={status}
        delta={spendDelta}
        hint="in selected range"
        onRetry={retry}
        errorMessage={errorMessage}
      />
      <KpiCard
        label="Budget remaining"
        value={data ? formatCentsWhole(data.lifetime.remainingCents) : "—"}
        status={current}
        hint={data ? `Lifetime, of ${formatCentsWhole(data.lifetime.budgetCents)} budgeted` : ""}
        onRetry={retry}
        errorMessage={errorMessage}
      />
    </div>
    </div>
  );
}

// Direction follows the rounded text, so a change that displays as 0.00 pts reads as flat.
function ctrChange(now: number, before: number): Delta {
  const points = (now - before) * 100;
  const text = `${points.toFixed(2)} pts`;
  const rounded = Number(points.toFixed(2));
  return { text, direction: rounded === 0 ? "flat" : rounded > 0 ? "up" : "down" };
}

function directionOf(now: number, before: number): Direction {
  if (now === before) return "flat";
  return now > before ? "up" : "down";
}

function statusOf<T>(state: PollState<T>): Status {
  if (state.error && !state.data) return "error";
  if (!state.data) return "loading";
  return "ready";
}
