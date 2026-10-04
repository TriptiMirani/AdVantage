# AdVantage: real-time ad campaign and analytics dashboard

## Measured results

Run `mutu3ubs` on 2026-10-04: 50 load campaigns, 30 seconds per step, 17,249 accepted events, one machine (Windows, Docker Desktop, Node 22, Postgres 16, Redis 7), sync worker stopped. Source: `simulator/out/mutu3ubs.json`.

| Target req/s | Achieved | Accepted | Failed | p50 ms | p95 ms | p99 ms | Max ms | Dashboard p50 / p95 ms | Postgres rows written | Redis ops/s | Loop lag p99 ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 50 | 50 | 1,500 | 0 | 4.56 | 8.80 | 21.68 | 53.07 | 17.4 / 35.6 | 0 | 166 | 21.2 |
| 75 | 75 | 2,249 | 0 | 3.90 | 8.05 | 14.30 | 41.68 | 18.6 / 35.6 | 0 | 252 | 20.9 |
| 100 | 100 | 3,000 | 0 | 3.38 | 7.40 | 16.14 | 37.72 | 16.6 / 35.9 | 0 | 327 | 21.0 |
| 150 | 150 | 4,500 | 0 | 3.03 | 6.20 | 11.05 | 71.53 | 17.4 / 31.8 | 0 | 515 | 21.3 |
| 200 | 200 | 6,000 | 0 | 2.80 | 5.68 | 9.20 | 24.19 | 17.0 / 31.0 | 0 | 653 | 20.9 |

**Verification: PASS.** For all 50 campaigns, the expected totals (from the simulator's own count), the Redis counters before the flush, and the Postgres totals after the flush agree exactly: 0 mismatches in impressions, clicks, or spend. The single flush wrote 151 rows: 50 hourly, 50 daily, 50 campaign updates, and 1 ledger row. It did not write once per event.

### Repeat runs (2026-10-04)

Each configuration ran three times, one at a time, with the sync worker stopped. Medians across the three runs; the range is the lowest and highest of the three. Sources: `simulator/out/mutyfqwr.json`, `mutykyp4.json`, `mutypp7j.json` (50 campaigns) and `mutyj5wi.json`, `mutyo50l.json`, `mutysy7i.json` (500 campaigns).

| Campaigns | Target req/s | Accepted per run | Failed | Ingestion p50 ms | p95 ms | p99 ms | Dashboard p50 / p95 ms |
|---|---|---|---|---|---|---|---|
| 50 | 250 | 7,500 | 0 | 3.00 (2.98–3.01) | 7.08 (6.54–7.61) | 15.85 (12.50–17.39) | 22.3 / 57.6 |
| 50 | 300 | 9,000 | 0 | 2.93 (2.91–2.94) | 7.00 (6.92–7.05) | 14.87 (11.81–18.14) | 19.2 / 57.6 |
| 50 | 400 | 12,000 | 0 | 2.60 (2.59–2.68) | 7.33 (7.29–7.67) | 14.21 (12.16–14.32) | 18.5 / 59.5 |
| 500 | 200 | 6,000 | 0 | 3.77 (3.76–3.83) | 8.99 (8.59–9.19) | 22.06 (14.09–22.79) | 18.6 / 74.4 |

- **Every run achieved its target rate,** with no failed requests.
- **Every accepted event is in Postgres.** The primary check passed in all six runs, and the Redis check passed in all six.
- **400 req/s ran cleanly.** The simulator's loop lag stayed near 22 ms in every step, so it was not the limit.

### Ceiling run (2026-10-04)

Run `mutzaqny`, sync worker stopped, 50 campaigns, 30 seconds per step. Source: `simulator/out/mutzaqny.json`.

| Target req/s | Achieved | Accepted | Failed | Ingestion p50 / p95 / p99 ms | Dashboard p50 / p95 ms | Loop lag p99 ms |
|---|---|---|---|---|---|---|
| 500 | 500 | 15,000 | 0 | 2.39 / 6.91 / 9.89 | 18.2 / 61.4 | 22.2 |
| 600 | 599.9 | 17,998 | 2 (connection reset) | 2.36 / 7.63 / 11.37 | 19.3 / 62.3 | 22.2 |
| 800 | 800 | 24,000 | 0 | 1.96 / 8.24 / 11.77 | 20.4 / 64.4 | 22.5 |

The primary check and the Redis check both passed (0 mismatches, 56,998 events). Every step ran at its target rate, and the simulator's loop lag stayed flat, so the simulator did not limit these steps. The two connection resets at 600 req/s were not investigated. They are 0.01% of that step's requests.
- **The dashboard's p95 is higher than in the first run** (57 to 74 ms, against 31 to 36 ms). The campaign table has grown, since every benchmark run adds campaigns. Whether campaign count is the cause has not been tested.

### With the worker running

Two runs had the sync worker running, so a flush landed inside a step. Both passed the Postgres check, and the Redis check does not apply to them.

| Campaigns | Target req/s | Ingestion p50 / p95 / p99 ms | Dashboard p50 / p95 ms |
|---|---|---|---|
| 50 | 250 | 2.95 / 6.50 / 13.79 | 23.0 / 65.3 |
| 50 | 300 | 2.75 / 6.72 / 15.10 | 18.6 / 69.6 |
| 50 | 400 | 2.47 / 6.30 / 8.54 | 17.1 / 61.0 |
| 500 | 200 | 3.20 / 7.71 / 9.79 | 16.9 / 57.2 |

A flush has little effect on ingestion latency. The flushed steps are within the range of the clean runs.

### What these numbers mean

- **Ingestion latency is measured at the client.** It includes the HTTP round trip on localhost, Express, and the Redis `MULTI`. It is not a server-side timer.
- **Latency does not rise with load in this range.** Ingestion p50 falls slightly as the rate rises. The likely cause is that higher rates keep connections busier, but that is a hypothesis, not something measured separately.
- **Dashboard latency under load** is the mix of two queries: the 30-day summary and the campaign ranking. Each has an idle baseline in the phase 6 doc. The two endpoints were not separated under load.
- **Loop lag is about 21 to 22 ms at every step.** Part of this is Windows' default timer resolution (about 15 ms), so the scheduler sends in small bursts. The rate is still correct over each second.
- **One machine.** The simulator, API, worker, Postgres, and Redis all run on the same laptop, sharing its CPU. Numbers on separate hardware will differ.
- **Runs cannot overlap.** Two simulator runs at once share one server, and each run's flush lands in the other's steps. The simulator now refuses to start while another run is in progress.

## What the system does

```
traffic -> POST /track (Express) -> Redis INCR (MULTI with EXPIRE NX)
                                        |
             worker every 60 s -> SCAN, RENAME to staging keys, aggregate
                                        |
             one Postgres transaction: hourly and daily stats, campaign spend, ledger row
                                        |
             GET /analytics/* (Prisma groupBy on indexed date columns) -> React dashboard, polling every 5 s
```

- **Ingestion never writes to Postgres per event.** Campaign status is cached for 5 seconds; unknown or inactive campaigns are rejected.
- **Money is exact.** Spend is stored as integer micros (BigInt). Budgets are whole cents.
- **Zero lost events, zero double counts.** Counters are renamed to staging keys before they are read, and cleared only after the commit. A ledger row makes replay safe after a crash.
- **Each phase has a document** in `docs/` with the design, the tradeoffs, and commands to verify it.

## Run it

Prerequisites: Docker Desktop, Node 22, and a Chromium install for Playwright (`npx playwright install chromium`).

```bash
docker compose up -d                                 # Postgres (host port 5433) and Redis
cd server && npm install && npm run db:deploy && npm run start   # API on :3001
cd server && npm run worker                          # sync worker, flushes every 60 s
cd client && npm install && npm run dev              # dashboard on :5173
cd simulator && npm install && npm run simulate -- --steps 50,75,100,150,200 --seconds 30
```

The simulator creates its own campaigns, runs each step, flushes once, and checks every campaign's totals in Postgres. It also checks Redis when no worker flush happened during the run. The full run takes about 4 to 5 minutes. Stop the sync worker first if you want the Redis check to run.

Tests:

```bash
cd server && npm run test && npm run typecheck       # 44 unit tests
cd client && npm run typecheck && npm run build
cd client && npx playwright test                     # three end-to-end tests (dashboard running)
cd simulator && npm run test                         # 10 unit tests
```

## Limits

- The benchmark is a single-machine run. The server ran cleanly up to 800 req/s. Higher rates have not been measured.
- The dashboard's previous-period comparison uses seeded September data, so its deltas are not meaningful yet.
- A Postgres outage longer than 24 hours expires the staged counters (the Redis safety TTL). Shorter outages replay without loss.
- `/track` has no authentication.
- The seeded analytics data (about 720,000 hourly rows) and the benchmark campaigns are still in the database until they are removed (`DELETE FROM "Campaign" WHERE name LIKE 'Seed %' OR name LIKE 'Load Test %';`).

## Phases

| Phase | Document |
|---|---|
| 0 Environment | `docs/phase-0-environment.md` |
| 1 Data model and campaign CRUD | `docs/phase-1-campaign-crud.md` |
| 2 Ingestion engine | `docs/phase-2-ingestion.md` |
| 3 Sync worker | `docs/phase-3-sync-worker.md` |
| 4 Analytics API and indexes | `docs/phase-4-analytics.md`, `docs/phase-4-index-benchmarks.md` |
| 5 Dashboard | `docs/phase-5-dashboard.md` |
| 6 Simulator and benchmark | this README and `simulator/` |
