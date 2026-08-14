import { AppDataSource } from "#server/utils/database";
import { CampaignCollaborator } from "#server/entities/campaignCollaborator.entity";
import { getOrgRole, requireCampaignAccess } from "#server/utils/campaign";
import { authDb } from "#server/utils/auth";
import { logAudit } from "#server/utils/audit";
import { notify } from "#server/utils/notify";

/**
 * Add a collaborator to the campaign by email (manager-only). The invitee must
 * be a registered user. Org members may be added too (harmless — the most
 * permissive right wins), but the typical use is inviting org outsiders.
 */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { user, campaign, rights } = await requireCampaignAccess(event, campaignId);
  if (!rights.canManage) {
    throw createError({ statusCode: 403, statusMessage: "仅活动管理者可添加协作者" });
  }
  const { email } = await readBody<{ email?: string }>(event);
  const norm = (email ?? "").trim().toLowerCase();
  if (!norm) {
    throw createError({ statusCode: 400, statusMessage: "请填写邮箱" });
  }
  const u = authDb
    .prepare("SELECT id, name, email FROM user WHERE lower(email) = ?")
    .get(norm) as { id: string; name: string; email: string } | undefined;
  if (!u) {
    throw createError({ statusCode: 404, statusMessage: "未找到该邮箱的注册用户" });
  }
  if (
    campaign.organizationId &&
    (await getOrgRole(campaign.organizationId, u.id))
  ) {
    throw createError({ statusCode: 400, statusMessage: "该用户已是组织成员，无需添加为协作者" });
  }

  const repo = AppDataSource.getRepository(CampaignCollaborator);
  const existing = await repo.findOneBy({ campaignId, userId: u.id });
  if (existing) {
    throw createError({ statusCode: 400, statusMessage: "该用户已是协作者" });
  }
  await repo.save({ campaignId, userId: u.id });
  logAudit({
    organizationId: campaign.organizationId,
    campaignId,
    actorId: user.id,
    action: "campaign.collaborator.add",
    target: u.email,
  });
  notify(u.id, "collaborator.added", {
    link: `/?campaign=${campaignId}`,
    data: { campaign: campaign.name || campaign.expectedTitle, by: user.name },
  });
  return {
    ok: true,
    collaborator: { userId: u.id, name: u.name, email: u.email },
  };
});
