-- Analytics seed for Phase 4 (reused in Phase 6). Run once with psql. Refuses to run twice.
-- 1,000 campaigns x 30 days x 24 hours = 720,000 HourlyStat rows, plus 30,000 DailyStat rows.
-- Remove with: DELETE FROM "Campaign" WHERE name LIKE 'Seed %';   (cascades to the stats rows)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Campaign" WHERE name LIKE 'Seed %') THEN
    RAISE EXCEPTION 'Seed data already loaded. Remove it first: DELETE FROM "Campaign" WHERE name LIKE ''Seed %%'';';
  END IF;
END $$;

-- Fixes random() so the same seed always produces the same numbers.
SELECT setseed(0.42);

BEGIN;

INSERT INTO "Campaign" (id, name, status, "budgetCents", "spentMicros", "costPerImpressionMicros",
                        "costPerClickCents", "targetAudience", "creativeUrl", "startDate", "endDate")
SELECT gen_random_uuid()::text,
       'Seed ' || lpad(n::text, 4, '0'),
       'ACTIVE',
       1000000000,
       0,
       1500,
       25,
       '{"region":"US"}'::jsonb,
       'https://example.com/seed.png',
       TIMESTAMP '2026-09-01 00:00:00',
       TIMESTAMP '2026-12-31 00:00:00'
FROM generate_series(1, 1000) AS n;

-- Spend uses the same rates as the seed campaigns: 1500 micros per impression, 25 cents per click.
INSERT INTO "HourlyStat" (id, "campaignId", "hourBucket", impressions, clicks, "spendMicros")
SELECT gen_random_uuid()::text,
       c.id,
       h.bucket,
       i.imps,
       k.clicks,
       i.imps * 1500 + k.clicks * 250000
FROM "Campaign" c
CROSS JOIN generate_series(TIMESTAMP '2026-09-01 00:00:00',
                           TIMESTAMP '2026-09-30 23:00:00',
                           INTERVAL '1 hour') AS h(bucket)
CROSS JOIN LATERAL (SELECT floor(random() * 200)::int AS imps) AS i
CROSS JOIN LATERAL (SELECT floor(random() * (i.imps / 10 + 1))::int AS clicks) AS k
WHERE c.name LIKE 'Seed %';

INSERT INTO "DailyStat" (id, "campaignId", "dayBucket", impressions, clicks, "spendMicros")
SELECT gen_random_uuid()::text,
       h."campaignId",
       date_trunc('day', h."hourBucket"),
       SUM(h.impressions),
       SUM(h.clicks),
       SUM(h."spendMicros")
FROM "HourlyStat" h
JOIN "Campaign" c ON c.id = h."campaignId"
WHERE c.name LIKE 'Seed %'
GROUP BY h."campaignId", date_trunc('day', h."hourBucket");

UPDATE "Campaign" c
SET "spentMicros" = s.total
FROM (
  SELECT "campaignId", SUM("spendMicros") AS total
  FROM "HourlyStat"
  GROUP BY "campaignId"
) s
WHERE s."campaignId" = c.id AND c.name LIKE 'Seed %';

COMMIT;

-- The planner needs fresh statistics to choose plans fairly.
ANALYZE "Campaign";
ANALYZE "HourlyStat";
ANALYZE "DailyStat";

SELECT (SELECT COUNT(*) FROM "Campaign" WHERE name LIKE 'Seed %') AS seed_campaigns,
       (SELECT COUNT(*) FROM "HourlyStat" h JOIN "Campaign" c ON c.id = h."campaignId" WHERE c.name LIKE 'Seed %') AS hourly_rows,
       (SELECT COUNT(*) FROM "DailyStat" d JOIN "Campaign" c ON c.id = d."campaignId" WHERE c.name LIKE 'Seed %') AS daily_rows;
