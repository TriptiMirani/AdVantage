// Repeated HTTP timing for the analytics endpoints. Usage: node scripts/bench-analytics.mjs <label> <runs>
// Each endpoint gets warm-up requests that are not recorded, then <runs> timed requests on one keep-alive connection.
const [label = "run", runsArg = "40", only = ""] = process.argv.slice(2);
const runs = Number(runsArg);
const base = "http://localhost:3001/analytics";

const endpoints = {
  summary_1day: `${base}/summary?from=2026-09-15&to=2026-09-15`,
  hourly_1day: `${base}/timeseries?from=2026-09-15&to=2026-09-15&granularity=hour`,
  summary_30days: `${base}/summary?from=2026-09-01&to=2026-09-30`,
  hourly_7days: `${base}/timeseries?from=2026-09-10&to=2026-09-16&granularity=hour`,
  campaigns_30days: `${base}/campaigns?from=2026-09-01&to=2026-09-30&sort=spend&limit=20`,
};

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

for (const [name, url] of Object.entries(endpoints)) {
  if (only && !name.startsWith(only)) continue;
  for (let i = 0; i < 5; i++) {
    const warm = await fetch(url);
    await warm.arrayBuffer();
  }

  const times = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    const res = await fetch(url);
    await res.arrayBuffer();
    times.push(performance.now() - start);
    if (!res.ok) throw new Error(`${name} returned HTTP ${res.status}`);
  }

  times.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      label,
      endpoint: name,
      runs,
      p50_ms: Number(percentile(times, 50).toFixed(2)),
      p95_ms: Number(percentile(times, 95).toFixed(2)),
      min_ms: Number(times[0].toFixed(2)),
      max_ms: Number(times[times.length - 1].toFixed(2)),
    }),
  );
}
