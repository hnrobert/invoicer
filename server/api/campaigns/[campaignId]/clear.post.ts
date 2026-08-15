import { unlink } from "node:fs/promises";
import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import { requireCampaignAccess } from "#server/utils/campaign";

/**
 * Remove uploaded files + records in a campaign, keeping the campaign itself.
 * Privileged users (canManage / canReview / legacy mode) clear the WHOLE
 * campaign; everyone else (plain member / collaborator / public uploader)
 * clears only their own uploads.
 */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { user, rights } = await requireCampaignAccess(event, campaignId);
  const clearAll = rights.canManage || rights.canReview;

  const repo = AppDataSource.getRepository(Invoice);
  const where = clearAll
    ? { campaignId }
    : { campaignId, uploaderId: user.id };
  const rows = await repo.find({ where });
  for (const r of rows) await unlink(r.savedPath).catch(() => {});
  await repo.delete(where);
  return {
    ok: true,
    msg: clearAll ? "All uploaded files cleared" : "Your uploaded files cleared",
  };
});
