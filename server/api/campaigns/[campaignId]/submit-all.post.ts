import { In } from "typeorm";
import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import { requireCampaignAccess } from "#server/utils/campaign";

const TERMINAL = ["qualified", "manual", "unqualified"] as const;

/**
 * Submit every one of the caller's own submittable draft invoices in one go
 * (the "Submit all" button). Same rules as the single-invoice submit endpoint;
 * returns the number actually submitted.
 */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { user } = await requireCampaignAccess(event, campaignId);

  const repo = AppDataSource.getRepository(Invoice);
  const res = await repo.update(
    {
      campaignId,
      uploaderId: user.id,
      reviewState: "draft",
      status: In(TERMINAL as unknown as string[]),
    },
    { reviewState: "submitted", reason: "Submitted — awaiting review" },
  );
  return { ok: true, submitted: res.affected ?? 0 };
});
