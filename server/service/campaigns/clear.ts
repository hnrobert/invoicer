import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import { storage } from "#server/utils/storage";
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
