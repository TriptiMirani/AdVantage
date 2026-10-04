import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PollState } from "../hooks/usePolling";
import { CHART } from "../lib/chartColors";
import { formatCents, formatCompact, formatFull, formatPercent } from "../lib/format";
import { bucketKey, bucketStarts, type DateRange } from "../lib/range";
import type { TimeseriesResponse } from "../types";
import { EmptyState, ErrorState, Skeleton, StaleNotice, buttonClass } from "./states";

type Metric = "counts" | "ctr" | "spend";

const METRICS: { key: Metric; label: string }[] = [
  { key: "counts", label: "Impressions & clicks" },
  { key: "ctr", label: "CTR" },
  { key: "spend", label: "Spend" },
];

type Row = {
  t: string;
  label: string;
  impressions: number;
  clicks: number;
  ctr: number | null;
  spendCents: number;
};

const axisTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const axisHour = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", hour12: false, timeZone: "UTC" });
const tooltipTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

type Props = {
  series: PollState<TimeseriesResponse>;
  range: DateRange;
  granularity: "day" | "hour";
  onRetry: () => void;
};

export function TrendChart({ series, range, granularity, onRetry }: Props) {
  const [metric, setMetric] = useState<Metric>("counts");
  const [hidden, setHidden] = useState<Record<"impressions" | "clicks", boolean>>({
    impressions: false,
    clicks: false,
  });

  const rows = useMemo<Row[]>(() => {
    if (!series.data) return [];
    const byBucket = new Map(series.data.buckets.map((bucket) => [bucketKey(bucket.bucket), bucket]));
    return bucketStarts(range, granularity).map((start) => {
      const bucket = byBucket.get(start);
      const date = new Date(start);
      return {
        t: start,
        label: granularity === "hour" ? axisHour.format(date) : axisTime.format(date),
        impressions: bucket?.impressions ?? 0,
        clicks: bucket?.clicks ?? 0,
        ctr: bucket ? bucket.ctr : null,
        spendCents: bucket?.spendCents ?? 0,
      };
    });
  }, [series.data, range, granularity]);

  const hasActivity = rows.some((row) => row.impressions > 0 || row.clicks > 0 || row.spendCents > 0);
  const granularityText = granularity === "hour" ? "Hourly buckets, UTC" : "Daily buckets, UTC";

  return (
    <section aria-labelledby="trend-title" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 id="trend-title" className="text-sm font-medium text-text">
            Trend
          </h2>
          <p className="text-xs text-muted">{granularityText}</p>
        </div>
        <div role="group" aria-label="Metric" className="flex flex-wrap gap-2">
          {METRICS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={metric === item.key}
              onClick={() => setMetric(item.key)}
              className={`${buttonClass} ${metric === item.key ? "border-accent text-accent" : ""}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {metric === "counts" && (
        <div role="group" aria-label="Series" className="flex flex-wrap gap-3 text-xs">
          <LegendToggle
            label="Impressions"
            color={CHART.impressions}
            pressed={!hidden.impressions}
            onToggle={() => setHidden((h) => ({ ...h, impressions: !h.impressions }))}
          />
          <LegendToggle
            label="Clicks"
            color={CHART.clicks}
            pressed={!hidden.clicks}
            onToggle={() => setHidden((h) => ({ ...h, clicks: !h.clicks }))}
          />
        </div>
      )}

      {series.error && series.data && <StaleNotice lastUpdated={series.lastUpdated} onRetry={onRetry} />}

      <div className="h-80">
        {series.loading && !series.data && <Skeleton className="h-full w-full" />}
        {series.error && !series.data && <ErrorState message={series.error.message} onRetry={onRetry} />}
        {series.data && !hasActivity && <EmptyState>No data for this range</EmptyState>}
        {series.data && hasActivity && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={CHART.gridline} vertical={false} />
              <XAxis
                dataKey="label"
                stroke={CHART.axis}
                tick={{ fill: CHART.muted, fontSize: 12 }}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              {metric === "counts" && (
                <YAxis stroke={CHART.axis} tick={{ fill: CHART.muted, fontSize: 12 }} tickFormatter={formatCompact} width={56} />
              )}
              {metric === "ctr" && (
                <YAxis
                  stroke={CHART.axis}
                  tick={{ fill: CHART.muted, fontSize: 12 }}
                  tickFormatter={(value: number) => formatPercent(value)}
                  width={64}
                />
              )}
              {metric === "spend" && (
                <YAxis
                  stroke={CHART.axis}
                  tick={{ fill: CHART.muted, fontSize: 12 }}
                  tickFormatter={(value: number) => `$${formatCompact(value / 100)}`}
                  width={64}
                />
              )}
              <Tooltip
                labelFormatter={(_label, payload) => {
                  const point = payload?.[0]?.payload as Row | undefined;
                  return point ? `${tooltipTime.format(new Date(point.t))} UTC` : "";
                }}
                formatter={(value, name) => {
                  if (metric === "ctr") return [formatPercent(typeof value === "number" ? value : null), name];
                  if (metric === "spend") return [formatCents(Number(value)), name];
                  return [formatFull(Number(value)), name];
                }}
                contentStyle={{ background: "#0b0f14", border: `1px solid ${CHART.axis}`, borderRadius: 6, color: CHART.ink }}
                labelStyle={{ color: CHART.muted }}
              />
              {metric === "counts" && (
                <>
                  <Line
                    type="monotone"
                    dataKey="impressions"
                    name="Impressions"
                    stroke={CHART.impressions}
                    strokeWidth={2}
                    dot={false}
                    hide={hidden.impressions}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="clicks"
                    name="Clicks"
                    stroke={CHART.clicks}
                    strokeWidth={2}
                    dot={false}
                    hide={hidden.clicks}
                    isAnimationActive={false}
                  />
                </>
              )}
              {metric === "ctr" && (
                <Line
                  type="monotone"
                  dataKey="ctr"
                  name="CTR"
                  stroke={CHART.impressions}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}
              {metric === "spend" && (
                <Line
                  type="monotone"
                  dataKey="spendCents"
                  name="Spend"
                  stroke={CHART.impressions}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function LegendToggle({
  label,
  color,
  pressed,
  onToggle,
}: {
  label: string;
  color: string;
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={`${buttonClass} flex items-center gap-2 ${pressed ? "" : "opacity-50"}`}
    >
      <span aria-hidden="true" className="inline-block h-2 w-4 rounded-sm" style={{ background: color }} />
      {label}
    </button>
  );
}
