import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import type { Campaign } from "#server/entities/campaign.entity";
import { storage } from "#server/utils/storage";
import { logAudit } from "#server/utils/audit";
import type { ClearResponse } from "#shared/api";
import type { AuthUser, CampaignRights } from "#shared/types";

/**
 * Remove uploaded files + records in a campaign, keeping the campaign itself.
 * Privileged users (canManage / canReview / legacy mode) clear the WHOLE
 * campaign; everyone else (plain member / collaborator / public uploader)
 * clears only their own uploads.
 */
export async function clearUploads(
  user: Pick<AuthUser, "id">,
  campaignId: number,
  rights: CampaignRights,
): Promise<ClearResponse> {
  const repo = AppDataSource.getRepository(Invoice);
  const where =
    rights.canManage || rights.canReview
      ? { campaignId }
      : { campaignId, uploaderId: user.id };
  const rows = await repo.find({ where });
  for (const r of rows) await storage.remove(r.savedPath);
  await repo.delete(where);
  return {
    ok: true,
    msg:
      rights.canManage || rights.canReview
        ? "All uploaded files cleared"
        : "Your uploaded files cleared",
  };
}

/** Delete ONE uploaded file (storage object + record). Same ownership rule
 * as clearUploads: privileged users delete any file in the campaign,
 * everyone else only their own uploads. */
export async function deleteInvoice(
  user: Pick<AuthUser, "id">,
  campaign: Campaign,
  rights: CampaignRights,
  invoiceId: number,
): Promise<ClearResponse> {
  const repo = AppDataSource.getRepository(Invoice);
  const row = await repo.findOneBy({ id: invoiceId, campaignId: campaign.id });
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: "File not found" });
  }
  if (!(rights.canManage || rights.canReview) && row.uploaderId !== user.id) {
    throw createError({ statusCode: 403, statusMessage: "Not your upload" });
  }
  await storage.remove(row.savedPath);
  await repo.delete({ id: invoiceId });
  logAudit({
    organizationId: campaign.organizationId,
    campaignId: campaign.id,
    actorId: user.id,
    action: "campaign.invoice.delete",
    target: row.filename,
  });
  return { ok: true, msg: "File deleted" };
}
