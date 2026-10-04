-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED');

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "budgetCents" INTEGER NOT NULL,
    "spentCents" INTEGER NOT NULL DEFAULT 0,
    "costPerImpressionMicros" INTEGER NOT NULL,
    "costPerClickCents" INTEGER NOT NULL,
    "targetAudience" JSONB NOT NULL,
    "creativeUrl" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HourlyStat" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "hourBucket" TIMESTAMP(3) NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "spendCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HourlyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyStat" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "dayBucket" TIMESTAMP(3) NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "spendCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HourlyStat_campaignId_hourBucket_idx" ON "HourlyStat"("campaignId", "hourBucket");

-- CreateIndex
CREATE UNIQUE INDEX "HourlyStat_campaignId_hourBucket_key" ON "HourlyStat"("campaignId", "hourBucket");

-- CreateIndex
CREATE INDEX "DailyStat_campaignId_dayBucket_idx" ON "DailyStat"("campaignId", "dayBucket");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStat_campaignId_dayBucket_key" ON "DailyStat"("campaignId", "dayBucket");

-- AddForeignKey
ALTER TABLE "HourlyStat" ADD CONSTRAINT "HourlyStat_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyStat" ADD CONSTRAINT "DailyStat_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
