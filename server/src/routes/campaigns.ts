import { Router } from "express";
import { Prisma, type Campaign } from "@prisma/client";
import { prisma } from "../prisma";
import { HttpError, notFound } from "../errors";
import {
  campaignIdParamSchema,
  createCampaignSchema,
  listCampaignsQuerySchema,
  updateCampaignSchema,
} from "../schemas/campaign";

// JSON cannot carry BigInt, so spend leaves the API as a string. spentCents is derived for display.
function toCampaignResponse(campaign: Campaign) {
  return {
    ...campaign,
    spentMicros: campaign.spentMicros.toString(),
    spentCents: Number(campaign.spentMicros / BigInt(10_000)),
  };
}

export const campaignsRouter = Router();

campaignsRouter.post("/", async (req, res, next) => {
  try {
    const body = createCampaignSchema.parse(req.body);
    const campaign = await prisma.campaign.create({
      data: {
        name: body.name,
        status: body.status ?? "DRAFT",
        budgetCents: body.budgetCents,
        costPerImpressionMicros: body.costPerImpressionMicros,
        costPerClickCents: body.costPerClickCents,
        targetAudience: body.targetAudience as Prisma.InputJsonValue,
        creativeUrl: body.creativeUrl,
        startDate: body.startDate,
        endDate: body.endDate,
      },
    });
    res.status(201).location(`/campaigns/${campaign.id}`).json(toCampaignResponse(campaign));
  } catch (err) {
    next(err);
  }
});

campaignsRouter.get("/", async (req, res, next) => {
  try {
    const query = listCampaignsQuerySchema.parse(req.query);
    const where = query.status ? { status: query.status } : {};
    const skip = (query.page - 1) * query.pageSize;

    const [data, total] = await prisma.$transaction([
      prisma.campaign.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
      prisma.campaign.count({ where }),
    ]);

    res.json({
      data: data.map(toCampaignResponse),
      page: query.page,
      pageSize: query.pageSize,
      total,
    });
  } catch (err) {
    next(err);
  }
});

campaignsRouter.get("/:id", async (req, res, next) => {
  try {
    const { id } = campaignIdParamSchema.parse(req.params);
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      throw notFound("Campaign not found");
    }
    res.json(toCampaignResponse(campaign));
  } catch (err) {
    next(err);
  }
});

campaignsRouter.patch("/:id", async (req, res, next) => {
  try {
    const { id } = campaignIdParamSchema.parse(req.params);
    const body = updateCampaignSchema.parse(req.body);

    const existing = await prisma.campaign.findUnique({ where: { id } });
    if (!existing) {
      throw notFound("Campaign not found");
    }

    const startDate = body.startDate ?? existing.startDate;
    const endDate = body.endDate ?? existing.endDate;
    if (endDate < startDate) {
      throw new HttpError(400, "VALIDATION_ERROR", "endDate must be on or after startDate", {
        path: ["endDate"],
      });
    }

    const campaign = await prisma.campaign.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.budgetCents !== undefined ? { budgetCents: body.budgetCents } : {}),
        ...(body.costPerImpressionMicros !== undefined
          ? { costPerImpressionMicros: body.costPerImpressionMicros }
          : {}),
        ...(body.costPerClickCents !== undefined
          ? { costPerClickCents: body.costPerClickCents }
          : {}),
        ...(body.targetAudience !== undefined
          ? { targetAudience: body.targetAudience as Prisma.InputJsonValue }
          : {}),
        ...(body.creativeUrl !== undefined ? { creativeUrl: body.creativeUrl } : {}),
        ...(body.startDate !== undefined ? { startDate: body.startDate } : {}),
        ...(body.endDate !== undefined ? { endDate: body.endDate } : {}),
      },
    });

    res.json(toCampaignResponse(campaign));
  } catch (err) {
    next(err);
  }
});

campaignsRouter.delete("/:id", async (req, res, next) => {
  try {
    const { id } = campaignIdParamSchema.parse(req.params);
    try {
      await prisma.campaign.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        throw notFound("Campaign not found");
      }
      throw err;
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
