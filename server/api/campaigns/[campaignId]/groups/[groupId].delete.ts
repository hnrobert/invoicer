import { AppDataSource } from "#server/utils/database";
import { CampaignGroup } from "#server/entities/campaignGroup.entity";
import { GroupReviewer } from "#server/entities/groupReviewer.entity";
import { Invoice } from "#server/entities/invoice.entity";
import { requireCampaignAccess } from "#server/utils/campaign";
import { logAudit } from "#server/utils/audit";

/** Delete a group: its invoices become ungrouped, assignments removed. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const groupId = Number(getRouterParam(event, "groupId"));
  const { user, campaign, rights } = await requireCampaignAccess(
    event,
    campaignId,
  );
  if (!rights.canManage) {
    throw createError({ statusCode: 403, statusMessage: "Managers only" });
  }
  const repo = AppDataSource.getRepository(CampaignGroup);
  const g = await repo.findOneBy({ id: groupId, campaignId });
  if (!g) throw createError({ statusCode: 404, statusMessage: "Not found" });
  await AppDataSource.getRepository(Invoice).update(
    { groupId },
    { groupId: null },
  );
  await AppDataSource.getRepository(GroupReviewer).delete({ groupId });
  await repo.delete({ id: groupId });
  logAudit({
    organizationId: campaign.organizationId,
    campaignId,
    actorId: user.id,
    action: "campaign.group.delete",
    target: g.name,
  });
  return { ok: true };
});
