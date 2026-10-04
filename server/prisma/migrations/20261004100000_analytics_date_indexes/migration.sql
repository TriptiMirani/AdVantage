-- Global date-range queries (no campaign filter) lead with the date, so they need an index that starts with it.
-- The existing (campaignId, bucket) indexes only help queries filtered by campaign.
CREATE INDEX "HourlyStat_hourBucket_idx" ON "HourlyStat"("hourBucket");
CREATE INDEX "DailyStat_dayBucket_idx" ON "DailyStat"("dayBucket");
