import { AppDataSource } from "#server/utils/database";
import { CampaignGroup } from "#server/entities/campaignGroup.entity";
import { requireCampaignAccess } from "#server/utils/campaign";
import { logAudit } from "#server/utils/audit";

/** Create a group (manager only). */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { user, campaign, rights } = await requireCampaignAccess(
    event,
    campaignId,
  );
  if (!rights.canManage) {
    throw createError({ statusCode: 403, statusMessage: "Managers only" });
  }
  const { name } = await readBody<{ name?: string }>(event);
  const n = (name ?? "").trim().slice(0, 40);
  if (!n) {
    throw createError({ statusCode: 400, statusMessage: "Name is required" });
  }
  const dup = await AppDataSource.getRepository(CampaignGroup).findOneBy({
    campaignId,
    name: n,
  });
  if (dup) {
    throw createError({ statusCode: 400, statusMessage: "Name exists" });
  }
  const g = await AppDataSource.getRepository(CampaignGroup).save({
    campaignId,
    name: n,
  });
  logAudit({
    organizationId: campaign.organizationId,
    campaignId,
    actorId: user.id,
    action: "campaign.group.create",
    target: n,
  });
  return { ok: true, group: { id: g.id, name: g.name } };
});
