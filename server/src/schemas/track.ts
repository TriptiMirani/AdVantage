import { z } from "zod";

// The server sets the timestamp, so the client cannot choose the hour bucket.
export const trackBodySchema = z.object({
  campaignId: z.string().uuid(),
  type: z.enum(["impression", "click"]),
});
