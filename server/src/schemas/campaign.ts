import { z } from "zod";

export const campaignStatusSchema = z.enum(["DRAFT", "ACTIVE", "PAUSED", "ENDED"]);

const moneyCents = z.number().int().nonnegative();
const micros = z.number().int().nonnegative();

// z.coerce.date() turns a missing value into an Invalid Date, so a missing field reported "Invalid date".
// Preprocess only converts values that are present, so a missing field reports "Required".
const dateField = z.preprocess(
  (value) => (value === undefined ? value : new Date(value as string | number | Date)),
  z.date({ required_error: "Required", invalid_type_error: "Invalid date" }),
);

// Only http and https make sense for a creative a browser will load.
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const creativeUrl = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(isHttpUrl, "creativeUrl must be an absolute http or https URL");

function endOnOrAfterStart(
  data: { startDate: Date; endDate: Date },
  ctx: z.RefinementCtx,
): void {
  if (data.endDate < data.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "endDate must be on or after startDate",
      path: ["endDate"],
    });
  }
}

export const createCampaignSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    status: campaignStatusSchema.optional(),
    budgetCents: moneyCents,
    costPerImpressionMicros: micros,
    costPerClickCents: moneyCents,
    targetAudience: z.record(z.unknown()),
    creativeUrl,
    startDate: dateField,
    endDate: dateField,
  })
  .superRefine(endOnOrAfterStart);

export const updateCampaignSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    status: campaignStatusSchema.optional(),
    budgetCents: moneyCents.optional(),
    costPerImpressionMicros: micros.optional(),
    costPerClickCents: moneyCents.optional(),
    targetAudience: z.record(z.unknown()).optional(),
    creativeUrl: creativeUrl.optional(),
    startDate: dateField.optional(),
    endDate: dateField.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field is required",
  });

export const listCampaignsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: campaignStatusSchema.optional(),
});

export const campaignIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
