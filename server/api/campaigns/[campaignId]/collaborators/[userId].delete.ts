import { AppDataSource } from "#server/utils/database";
import { CampaignCollaborator } from "#server/entities/campaignCollaborator.entity";
import { requireCampaignAccess } from "#server/utils/campaign";
import { logAudit } from "#server/utils/audit";

/** Remove a collaborator (manager-only). */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const userId = getRouterParam(event, "userId")!;
  const { user, campaign, rights } = await requireCampaignAccess(event, campaignId);
  if (!rights.canManage) {
    throw createError({ statusCode: 403, statusMessage: "Only campaign managers can remove collaborators" });
  }
  await AppDataSource.getRepository(CampaignCollaborator).delete({
    campaignId,
    userId,
  });
  logAudit({
    organizationId: campaign.organizationId,
    campaignId,
    actorId: user.id,
    action: "campaign.collaborator.remove",
    target: userId,
  });
  return { ok: true };
});
