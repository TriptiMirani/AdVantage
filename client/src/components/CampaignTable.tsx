import { useEffect, useId, useState } from "react";
import type { PollState } from "../hooks/usePolling";
import { formatCentsWhole, formatCompact, formatFull, formatPercent } from "../lib/format";
import type { CampaignRow, CampaignSort, CampaignStatus, CampaignsResponse } from "../types";
import { EmptyState, ErrorState, Skeleton, StaleNotice, buttonClass } from "./states";

const SORTABLE: { key: CampaignSort; label: string }[] = [
  { key: "impressions", label: "Impressions" },
  { key: "clicks", label: "Clicks" },
  { key: "spend", label: "Spend" },
];

const STATUS_STYLE: Record<CampaignStatus, string> = {
  ACTIVE: "bg-positive/15 text-positive",
  PAUSED: "bg-border text-text",
  ENDED: "bg-border text-muted",
  DRAFT: "bg-border text-muted",
};

const SEARCH_DEBOUNCE_MS = 300;

type Props = {
  campaigns: PollState<CampaignsResponse>;
  sort: CampaignSort;
  query: string;
  limit: number;
  offset: number;
  onSort: (sort: CampaignSort) => void;
  onSearch: (query: string) => void;
  onPage: (offset: number) => void;
  onEdit: (campaignId: string) => void;
  onRetry: () => void;
};

export function CampaignTable({ campaigns, sort, query, limit, offset, onSort, onSearch, onPage, onEdit, onRetry }: Props) {
  const searchId = useId();
  const [draft, setDraft] = useState(query);

  // Search applies after the user pauses typing, so each keystroke does not restart polling.
  useEffect(() => {
    if (draft === query) return;
    const timer = window.setTimeout(() => onSearch(draft), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const rows = campaigns.data?.campaigns ?? [];
  const total = campaigns.data?.total ?? 0;
  const hasNext = offset + limit < total;

  return (
    <section aria-labelledby="campaigns-title" className="flex w-full min-w-0 flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 id="campaigns-title" className="text-sm font-medium text-text">
            Campaigns
          </h2>
          <p className="text-xs text-muted">
            Impressions, clicks, CTR, and spend are for the selected range. Budget is lifetime.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={searchId} className="text-xs font-medium uppercase tracking-wide text-muted">
            Search by name
          </label>
          <input
            id={searchId}
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="e.g. Fall sale"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:w-64"
          />
        </div>
      </div>

      {campaigns.error && campaigns.data && <StaleNotice lastUpdated={campaigns.lastUpdated} onRetry={onRetry} />}
      {campaigns.loading && !campaigns.data && <Skeleton className="h-48 w-full" />}
      {campaigns.error && !campaigns.data && <ErrorState message={campaigns.error.message} onRetry={onRetry} />}
      {campaigns.data && rows.length === 0 && (
        <EmptyState>{query.trim() ? `No campaigns match “${query.trim()}”.` : "No campaigns yet. Use New campaign to add one."}</EmptyState>
      )}

      {campaigns.data && rows.length > 0 && (
        <>
          {/* relative: the visually hidden "Actions" label is absolutely positioned, and must clip here, not widen the page. */}
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="px-3 py-2 text-left font-medium">Campaign</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Status</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Budget (lifetime)</th>
                  {SORTABLE.map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={sort === column.key ? "descending" : "none"}
                      className="px-3 py-2 text-right font-medium"
                    >
                      <button
                        type="button"
                        onClick={() => onSort(column.key)}
                        className={`${buttonClass} border-0 px-1 py-0 text-xs uppercase ${sort === column.key ? "text-accent" : "text-muted"}`}
                      >
                        {column.label}
                        {sort === column.key ? " ▼" : ""}
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 text-right font-medium">CTR</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <CampaignRowView key={row.campaignId} row={row} onEdit={onEdit} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
            <span className="tabular-nums">
              Rows {offset + 1}–{offset + rows.length} of {formatFull(total)}
            </span>
            <div className="flex gap-2">
              <button type="button" className={buttonClass} disabled={offset === 0} onClick={() => onPage(Math.max(0, offset - limit))}>
                Previous
              </button>
              <button type="button" className={buttonClass} disabled={!hasNext} onClick={() => onPage(offset + limit)}>
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function CampaignRowView({ row, onEdit }: { row: CampaignRow; onEdit: (campaignId: string) => void }) {
  const name = row.name ?? "Deleted campaign";
  const idle = !row.hasActivity;
  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="px-3 py-2">
        <div className="font-medium text-text">{name}</div>
        <div className="text-xs text-muted">{row.campaignId.slice(0, 8)}</div>
      </td>
      <td className="px-3 py-2">
        {row.status ? (
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[row.status]}`}>{row.status}</span>
        ) : (
          <span className="text-xs text-muted">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        <BudgetBar budgetCents={row.budgetCents} spentCents={row.spentCents} />
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-text" title={idle ? undefined : formatFull(row.impressions)}>
        {idle ? "—" : formatCompact(row.impressions)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-text" title={idle ? undefined : formatFull(row.clicks)}>
        {idle ? "—" : formatCompact(row.clicks)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-text">{idle ? "—" : formatCentsWhole(row.spendCents)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-text">{idle ? "—" : formatPercent(row.ctr)}</td>
      <td className="px-3 py-2 text-right">
        <button type="button" onClick={() => onEdit(row.campaignId)} aria-label={`Edit ${name}`} className={buttonClass}>
          Edit
        </button>
      </td>
    </tr>
  );
}

function BudgetBar({ budgetCents, spentCents }: { budgetCents: number | null; spentCents: number | null }) {
  if (budgetCents === null || spentCents === null) {
    return <span className="text-xs text-muted">—</span>;
  }
  if (budgetCents === 0) {
    return <span className="text-xs text-muted">No budget set</span>;
  }

  const ratio = spentCents / budgetCents;
  const over = ratio > 1;
  const width = Math.min(100, ratio * 100);
  const label = `${formatCentsWhole(spentCents)} of ${formatCentsWhole(budgetCents)}`;

  return (
    <div className="flex min-w-[140px] flex-col gap-1">
      <div
        role="meter"
        aria-label={`Lifetime budget used: ${label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(ratio, 1) * 100)}
        className="h-2 w-full overflow-hidden rounded-full bg-border"
      >
        <div className={`h-full ${over ? "bg-negative" : "bg-accent"}`} style={{ width: `${width}%` }} />
      </div>
      <span className={`text-xs tabular-nums ${over ? "text-negative" : "text-muted"}`}>
        {over ? "Overspent · " : ""}
        {label}
      </span>
    </div>
  );
}
