import { useCallback, useEffect, useRef, useState } from "react";

export type PollState<T> = {
  data: T | null;
  error: Error | null;
  loading: boolean;
  lastUpdated: Date | null;
  retry: () => void;
};

type Snapshot<T> = Omit<PollState<T>, "retry">;

// Polls `fetcher` every `intervalMs`. A tick is skipped while a request is still in flight or the tab is hidden.
// When `deps` change, the previous data is dropped, the in-flight request is aborted, and polling restarts.
export function usePolling<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  intervalMs: number,
  deps: readonly unknown[],
): PollState<T> {
  const [snapshot, setSnapshot] = useState<Snapshot<T>>({
    data: null,
    error: null,
    loading: true,
    lastUpdated: null,
  });

  const fetcherRef = useRef(fetcher);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const run = useCallback(() => {
    if (inFlight.current || document.visibilityState === "hidden") return;

    const controller = new AbortController();
    inFlight.current = controller;

    fetcherRef.current(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setSnapshot({ data, error: null, loading: false, lastUpdated: new Date() });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const error = err instanceof Error ? err : new Error("Unknown error");
        setSnapshot((previous) => ({ ...previous, error, loading: false }));
      })
      .finally(() => {
        if (inFlight.current === controller) inFlight.current = null;
      });
  }, []);

  useEffect(() => {
    setSnapshot({ data: null, error: null, loading: true, lastUpdated: null });
    run();

    const timer = window.setInterval(run, intervalMs);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      inFlight.current?.abort();
      inFlight.current = null;
    };
  }, [run, intervalMs, ...deps]);

  return { ...snapshot, retry: run };
}
