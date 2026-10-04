import { Router } from "express";
import { campaigns, summary, timeseries } from "../analytics/queries";
import { campaignsQuerySchema, summaryQuerySchema, timeseriesQuerySchema } from "../schemas/analytics";

export const analyticsRouter = Router();

analyticsRouter.get("/summary", async (req, res, next) => {
  try {
    const query = summaryQuerySchema.parse(req.query);
    res.json(await summary(query));
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get("/timeseries", async (req, res, next) => {
  try {
    const query = timeseriesQuerySchema.parse(req.query);
    res.json(await timeseries(query));
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get("/campaigns", async (req, res, next) => {
  try {
    const query = campaignsQuerySchema.parse(req.query);
    res.json(await campaigns(query));
  } catch (err) {
    next(err);
  }
});
