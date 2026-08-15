import { AppDataSource } from "#server/utils/database";
import { Campaign } from "#server/entities/campaign.entity";
import { CampaignTransfer } from "#server/entities/campaignTransfer.entity";
import { getOrgRole, requireCampaignAccess } from "#server/utils/campaign";
import { authDb } from "#server/utils/auth";
import { logAudit } from "#server/utils/audit";
import { notify } from "#server/utils/notify";

/**
 * Initiate a cross-org transfer of an org campaign (source Owner/Admin or the
 * campaign manager). Creates a pending request; the target org's Owner/Admin
 * accepts at POST /api/transfers/:id/accept. Personal campaigns cannot be
 * transferred this way (they have no source org).
 */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { user, campaign, rights } = await requireCampaignAccess(event, campaignId);
  if (!campaign.organizationId) {
    throw createError({ statusCode: 400, statusMessage: "Personal campaigns cannot be transferred" });
  }
  const role = await getOrgRole(campaign.organizationId, user.id);
  if (!rights.canManage && role !== "owner" && role !== "admin") {
    throw createError({ statusCode: 403, statusMessage: "Only Owner/Admin or the campaign manager can initiate a transfer" });
  }

  const { target_org_id: targetOrgId } = await readBody<{
    target_org_id?: string;
  }>(event);
  if (!targetOrgId || targetOrgId === campaign.organizationId) {
    throw createError({ statusCode: 400, statusMessage: "Invalid target organization" });
  }
  const targetOrg = authDb
    .prepare("SELECT id, name FROM organization WHERE id = ?")
    .get(targetOrgId) as { id: string; name: string } | undefined;
  if (!targetOrg) {
    throw createError({ statusCode: 404, statusMessage: "Target organization not found" });
  }

  const repo = AppDataSource.getRepository(CampaignTransfer);
  const dup = await repo.findOneBy({
    campaignId,
    status: "pending",
  });
  if (dup) {
    throw createError({ statusCode: 400, statusMessage: "This campaign already has a pending transfer request" });
  }

  const tr = await repo.save({
    campaignId,
    fromOrganizationId: campaign.organizationId,
    toOrganizationId: targetOrgId,
    requestedBy: user.id,
    status: "pending",
  });

  logAudit({
    organizationId: campaign.organizationId,
    campaignId,
    actorId: user.id,
    action: "campaign.transfer.request",
    target: targetOrg.name,
  });

  // Notify the target org's owners/admins to accept.
  const admins = authDb
    .prepare(
      "SELECT userId FROM member WHERE organizationId = ? AND role IN ('owner','admin')",
    )
    .all(targetOrgId) as { userId: string }[];
  for (const a of admins) {
    notify(a.userId, "transfer.incoming", {
      link: "/organizations",
      data: {
        campaign: campaign.name || campaign.expectedTitle,
        from: authDb
          .prepare("SELECT name FROM organization WHERE id = ?")
          .get(campaign.organizationId) as { name: string } | undefined,
      },
    });
  }

  return { ok: true, transfer_id: tr.id };
});
