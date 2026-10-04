import { SEPTEMBER_2026, lastSevenDays, lastThirtyDays, type DateRange } from "../lib/range";
import { buttonClass } from "./states";

export type PresetKey = "30d" | "7d" | "sep2026";

export const PRESETS: { key: PresetKey; label: string; range: () => DateRange }[] = [
  { key: "30d", label: "Last 30 days", range: () => lastThirtyDays() },
  { key: "7d", label: "Last 7 days", range: () => lastSevenDays() },
  { key: "sep2026", label: "September 2026", range: () => SEPTEMBER_2026 },
];

type Props = {
  range: DateRange;
  preset: PresetKey;
  onPreset: (key: PresetKey) => void;
  lastUpdated: Date | null;
  failing: boolean;
  onNewCampaign: () => void;
};

export function TopBar({ range, preset, onPreset, lastUpdated, failing, onNewCampaign }: Props) {
  return (
    <header className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-lg font-semibold text-text">Campaign overview</h1>
        <p className="text-sm tabular-nums text-muted">
          {range.from} to {range.to} (UTC)
        </p>
      </div>

      <div className="flex flex-col gap-2 md:items-end">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onNewCampaign}
            className="rounded border border-accent bg-accent px-3 py-1 text-sm font-medium text-background hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            New campaign
          </button>
        </div>
        <div role="group" aria-label="Date range" className="flex flex-wrap gap-2">
          {PRESETS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={preset === item.key}
              onClick={() => onPreset(item.key)}
              className={`${buttonClass} ${preset === item.key ? "border-accent text-accent" : ""}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted" aria-live="polite">
          {failing
            ? "Live · update failed, retrying"
            : lastUpdated
              ? `Live · updated ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
              : "Live · waiting for first update"}
        </p>
      </div>
    </header>
  );
}
