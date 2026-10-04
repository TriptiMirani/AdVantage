-- Spend moves from whole cents to exact micros. Existing rows are converted, not dropped.
-- 1 cent = 10,000 micros.

ALTER TABLE "Campaign" ADD COLUMN "spentMicros" BIGINT NOT NULL DEFAULT 0;
UPDATE "Campaign" SET "spentMicros" = "spentCents" * 10000;
ALTER TABLE "Campaign" DROP COLUMN "spentCents";

ALTER TABLE "HourlyStat" ADD COLUMN "spendMicros" BIGINT NOT NULL DEFAULT 0;
UPDATE "HourlyStat" SET "spendMicros" = "spendCents" * 10000;
ALTER TABLE "HourlyStat" DROP COLUMN "spendCents";

ALTER TABLE "DailyStat" ADD COLUMN "spendMicros" BIGINT NOT NULL DEFAULT 0;
UPDATE "DailyStat" SET "spendMicros" = "spendCents" * 10000;
ALTER TABLE "DailyStat" DROP COLUMN "spendCents";

-- Ledger of committed flush batches.
CREATE TABLE "FlushBatch" (
    "id" TEXT NOT NULL,
    "committedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlushBatch_pkey" PRIMARY KEY ("id")
);
