import { z } from "zod";

const DAY_MS = 86_400_000;
const MAX_DAYS_DAILY = 366;
const MAX_DAYS_HOURLY = 7;

export function isRealDay(value: string): boolean {
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

// Both ends inclusive, so 2026-10-01 to 2026-10-01 is one day.
export function inclusiveDays(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS + 1;
}

const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine(isRealDay, "Not a real calendar date");

const rangeFields = {
  from: dayString,
  to: dayString,
  campaignId: z.string().uuid().optional(),
};

type Range = { from: string; to: string };

// String comparison is correct for YYYY-MM-DD.
function checkOrder(range: Range, ctx: z.RefinementCtx): void {
  if (range.from > range.to) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "from must not be after to", path: ["from"] });
  }
}

function checkSpan(range: Range, maxDays: number, ctx: z.RefinementCtx): void {
  if (range.from <= range.to && inclusiveDays(range.from, range.to) > maxDays) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Range may cover at most ${maxDays} days`,
      path: ["to"],
    });
  }
}

export const summaryQuerySchema = z
  .object(rangeFields)
  .superRefine((q, ctx) => {
    checkOrder(q, ctx);
    checkSpan(q, MAX_DAYS_DAILY, ctx);
  });

export const timeseriesQuerySchema = z
  .object({
    ...rangeFields,
    granularity: z.enum(["day", "hour"]).default("day"),
  })
  .superRefine((q, ctx) => {
    checkOrder(q, ctx);
    checkSpan(q, q.granularity === "hour" ? MAX_DAYS_HOURLY : MAX_DAYS_DAILY, ctx);
  });

export const campaignsQuerySchema = z
  .object({
    from: dayString,
    to: dayString,
    sort: z.enum(["spend", "impressions", "clicks"]).default("spend"),
    q: z.string().trim().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .superRefine((q, ctx) => {
    checkOrder(q, ctx);
    checkSpan(q, MAX_DAYS_DAILY, ctx);
  });

export type SummaryQuery = z.infer<typeof summaryQuerySchema>;
export type TimeseriesQuery = z.infer<typeof timeseriesQuerySchema>;
export type CampaignsQuery = z.infer<typeof campaignsQuerySchema>;
