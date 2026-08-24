import { AppDataSource } from "#server/utils/database";
import { CampaignGroup } from "#server/entities/campaignGroup.entity";
import { GroupReviewer } from "#server/entities/groupReviewer.entity";
import { requireCampaignAccess } from "#server/utils/campaign";
import { logAudit } from "#server/utils/audit";

/** Remove a reviewer from a group (manager only). */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const groupId = Number(getRouterParam(event, "groupId"));
  const userId = getRouterParam(event, "userId")!;
  const { user, campaign, rights } = await requireCampaignAccess(
    event,
    campaignId,
  );
  if (!rights.canManage) {
    throw createError({ statusCode: 403, statusMessage: "Managers only" });
  }
  const group = await AppDataSource.getRepository(CampaignGroup).findOneBy({
    id: groupId,
    campaignId,
  });
  if (!group) {
    throw createError({ statusCode: 404, statusMessage: "Group not found" });
  }
  await AppDataSource.getRepository(GroupReviewer).delete({ groupId, userId });
  logAudit({
    organizationId: campaign.organizationId,
    campaignId,
    actorId: user.id,
    action: "campaign.group.reviewer.remove",
    target: `${group.name}: ${userId}`,
  });
  return { ok: true };
});
