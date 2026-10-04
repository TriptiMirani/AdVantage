import { useState } from "react";
import { fetchCampaigns, fetchSummary, fetchTimeseries } from "./api/analytics";
import { CampaignDrawer, type DrawerTarget } from "./components/CampaignDrawer";
import { CampaignTable } from "./components/CampaignTable";
import { KpiRow } from "./components/KpiRow";
import { PRESETS, TopBar, type PresetKey } from "./components/TopBar";
import { TrendChart } from "./components/TrendChart";
import { usePolling } from "./hooks/usePolling";
import { granularityFor, lastThirtyDays, previousRange, type DateRange } from "./lib/range";
import type { CampaignSort } from "./types";

const POLL_MS = 5000;
const PAGE_SIZE = 20;

export default function App() {
  const [preset, setPreset] = useState<PresetKey>("30d");
  const [range, setRange] = useState<DateRange>(() => lastThirtyDays());
  const [sort, setSort] = useState<CampaignSort>("spend");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null);

  const granularity = granularityFor(range);
  const previous = previousRange(range);

  const summary = usePolling((signal) => fetchSummary(range, signal), POLL_MS, [range.from, range.to]);
  const previousSummary = usePolling(
    (signal) => fetchSummary(previous, signal),
    POLL_MS,
    [previous.from, previous.to],
  );
  const series = usePolling(
    (signal) => fetchTimeseries({ ...range, granularity }, signal),
    POLL_MS,
    [range.from, range.to, granularity],
  );
  const campaigns = usePolling(
    (signal) => fetchCampaigns({ ...range, sort, q: query, limit: PAGE_SIZE, offset }, signal),
    POLL_MS,
    [range.from, range.to, sort, query, offset],
  );

  const polls = [summary, previousSummary, series, campaigns];
  const lastUpdated = latest(polls.map((poll) => poll.lastUpdated));
  const failing = polls.some((poll) => poll.error !== null);

  const choosePreset = (key: PresetKey) => {
    const option = PRESETS.find((item) => item.key === key);
    if (!option) return;
    setPreset(key);
    setRange(option.range());
    setOffset(0);
  };

  const changeSort = (next: CampaignSort) => {
    setSort(next);
    setOffset(0);
  };

  const changeQuery = (next: string) => {
    setQuery(next);
    setOffset(0);
  };

  // After a save, refresh every widget at once so the table and KPIs show the change without waiting.
  const refreshAll = () => {
    summary.retry();
    previousSummary.retry();
    series.retry();
    campaigns.retry();
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-4 md:p-6">
      <TopBar
        range={range}
        preset={preset}
        onPreset={choosePreset}
        lastUpdated={lastUpdated}
        failing={failing}
        onNewCampaign={() => setDrawer({ kind: "create" })}
      />

      <KpiRow summary={summary} previous={previousSummary} />

      <TrendChart series={series} range={range} granularity={granularity} onRetry={series.retry} />

      <CampaignTable
        campaigns={campaigns}
        sort={sort}
        query={query}
        limit={PAGE_SIZE}
        offset={offset}
        onSort={changeSort}
        onSearch={changeQuery}
        onPage={setOffset}
        onEdit={(campaignId) => setDrawer({ kind: "edit", campaignId })}
        onRetry={campaigns.retry}
      />

      {drawer && (
        <CampaignDrawer target={drawer} onClose={() => setDrawer(null)} onSaved={refreshAll} />
      )}
    </main>
  );
}

function latest(dates: (Date | null)[]): Date | null {
  const present = dates.filter((d): d is Date => d !== null);
  if (present.length === 0) return null;
  return new Date(Math.max(...present.map((d) => d.getTime())));
}
