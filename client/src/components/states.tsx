import type { ReactNode } from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-border/60 ${className}`} />;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p role="status" className="py-8 text-center text-sm text-muted">{children}</p>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 py-4 text-sm">
      <p className="text-text">Couldn't load this data. {message}</p>
      <button type="button" onClick={onRetry} className={buttonClass}>
        Retry
      </button>
    </div>
  );
}

// Shown when a refresh fails but older data is still on screen, so stale numbers are never silent.
export function StaleNotice({ lastUpdated, onRetry }: { lastUpdated: Date | null; onRetry: () => void }) {
  const time = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "earlier";
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded border border-negative/60 px-3 py-2 text-xs text-text">
      <span>Couldn't refresh. Showing data from {time}. Retrying automatically.</span>
      <button type="button" onClick={onRetry} className={buttonClass}>
        Retry now
      </button>
    </div>
  );
}

export const buttonClass =
  "rounded border border-border px-3 py-1 text-sm text-text hover:bg-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
