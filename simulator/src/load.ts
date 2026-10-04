import http from "node:http";
import { performance } from "node:perf_hooks";
import { summarize } from "./stats";

export type EventType = "impression" | "click";
export type Tally = Map<string, { impressions: number; clicks: number }>;

export type StepResult = {
  targetRate: number;
  seconds: number;
  sent: number;
  accepted: number;
  failed: number;
  blocked: number;
  statusCounts: Record<string, number>;
  achievedRate: number;
  latencyMs: ReturnType<typeof summarize>;
};

export type StepOptions = {
  rate: number;
  seconds: number;
  campaignIds: string[];
  tally: Tally;
  baseUrl: { host: string; port: number };
  maxInFlight?: number;
  random?: () => number;
};

const IMPRESSION_SHARE = 0.7;
const DRAIN_TIMEOUT_MS = 10_000;

// Open loop: requests go out on the clock at the target rate, whether or not earlier ones have returned.
// A closed loop would slow down with the server and hide queueing. Requests the in-flight cap blocks are counted.
export function runStep(options: StepOptions): Promise<{ result: StepResult; latencies: number[] }> {
  const maxInFlight = options.maxInFlight ?? 1000;
  const random = options.random ?? Math.random;
  const agent = new http.Agent({ keepAlive: true, maxSockets: maxInFlight });

  let sent = 0;
  let accepted = 0;
  let failed = 0;
  let blocked = 0;
  let inFlight = 0;
  const statusCounts: Record<string, number> = {};
  const latencies: number[] = [];

  const record = (status: string, latency: number) => {
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    latencies.push(latency);
  };

  const send = () => {
    const campaignId = options.campaignIds[Math.floor(random() * options.campaignIds.length)];
    const type: EventType = random() < IMPRESSION_SHARE ? "impression" : "click";
    const payload = JSON.stringify({ campaignId, type });
    sent += 1;
    inFlight += 1;
    const started = performance.now();

    const request = http.request(
      {
        host: options.baseUrl.host,
        port: options.baseUrl.port,
        path: "/track",
        method: "POST",
        agent,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
      },
      (response) => {
        response.resume();
        response.on("end", () => {
          inFlight -= 1;
          const status = response.statusCode ?? 0;
          record(String(status), performance.now() - started);
          if (status === 202) {
            accepted += 1;
            const entry = options.tally.get(campaignId) ?? { impressions: 0, clicks: 0 };
            if (type === "impression") entry.impressions += 1;
            else entry.clicks += 1;
            options.tally.set(campaignId, entry);
          } else {
            failed += 1;
          }
        });
      },
    );
    request.on("error", (error: NodeJS.ErrnoException) => {
      inFlight -= 1;
      failed += 1;
      // The system error code (for example ECONNRESET) says what failed on the client side.
      record(error.code ?? "error", performance.now() - started);
    });
    request.end(payload);
  };

  return new Promise((resolve) => {
    const start = performance.now();
    const endAt = start + options.seconds * 1000;

    const tick = () => {
      const now = performance.now();
      const due = Math.floor((Math.min(now, endAt) - start) / 1000 * options.rate);
      while (sent + blocked < due) {
        if (inFlight >= maxInFlight) {
          blocked += 1;
        } else {
          send();
        }
      }
      if (now < endAt) {
        setTimeout(tick, 1);
        return;
      }
      drain(() => {
        agent.destroy();
        resolve({
          result: {
            targetRate: options.rate,
            seconds: options.seconds,
            sent,
            accepted,
            failed,
            blocked,
            statusCounts,
            achievedRate: accepted / options.seconds,
            latencyMs: summarize(latencies),
          },
          latencies,
        });
      });
    };

    tick();
  });

  function drain(done: () => void) {
    const deadline = performance.now() + DRAIN_TIMEOUT_MS;
    const check = () => {
      if (inFlight === 0 || performance.now() > deadline) return done();
      setTimeout(check, 20);
    };
    check();
  }
}
