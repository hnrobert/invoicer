import { AppDataSource } from "#server/utils/database";
import { CampaignGroup } from "#server/entities/campaignGroup.entity";
import { GroupReviewer } from "#server/entities/groupReviewer.entity";
import { requireCampaignAccess } from "#server/utils/campaign";
import { authDb } from "#server/utils/auth";
import { logAudit } from "#server/utils/audit";
import { notify } from "#server/utils/notify";

/** Assign a reviewer (by email) to a group (manager only). */
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
  const group = await AppDataSource.getRepository(CampaignGroup).findOneBy({
    id: groupId,
    campaignId,
  });
  if (!group) {
    throw createError({ statusCode: 404, statusMessage: "Group not found" });
  }
  const { email } = await readBody<{ email?: string }>(event);
  const u = authDb
    .prepare("SELECT id, name, email FROM user WHERE lower(email) = ?")
    .get((email ?? "").trim().toLowerCase()) as
    { id: string; name: string; email: string } | undefined;
  if (!u) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }
  const repo = AppDataSource.getRepository(GroupReviewer);
  if (await repo.findOneBy({ groupId, userId: u.id })) {
    throw createError({ statusCode: 400, statusMessage: "Already assigned" });
  }
  await repo.save({ groupId, userId: u.id });
  logAudit({
    organizationId: campaign.organizationId,
    campaignId,
    actorId: user.id,
    action: "campaign.group.reviewer.add",
    target: `${group.name}: ${u.email}`,
  });
  notify(u.id, "group.assigned", {
    link: `/orgs/undefined/campaigns/${campaignId}`,
    data: {
      group: group.name,
      campaign: campaign.name || campaign.expectedTitle,
    },
  });
  return { ok: true };
});
