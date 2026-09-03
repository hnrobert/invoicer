import { AppDataSource } from "#server/utils/database";
import { CampaignTransfer } from "#server/entities/campaignTransfer.entity";
import type { Campaign } from "#server/entities/campaign.entity";
import { getOrgRole } from "#server/utils/campaign";
import { sqlAll, sqlGet } from "#server/utils/auth";
import { logAudit } from "#server/utils/audit";
import { notify } from "#server/utils/notify";
import type { TransferRequestResponse } from "#shared/api";
import type { AuthUser, CampaignRights } from "#shared/types";

/**
 * Initiate a cross-org transfer of an org campaign (source Owner/Admin or the
 * campaign manager). Creates a pending request; the target org's Owner/Admin
 * accepts via service/transfers.
 */
export async function requestCampaignTransfer(
  user: Pick<AuthUser, "id">,
  campaign: Campaign,
  rights: CampaignRights,
  targetOrgId: string | undefined,
): Promise<TransferRequestResponse> {
  const campaignId = campaign.id;
  if (!campaign.organizationId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Personal campaigns cannot be transferred",
    });
  }
  const role = await getOrgRole(campaign.organizationId, user.id);
  if (!rights.canManage && role !== "owner" && role !== "admin") {
    throw createError({
      statusCode: 403,
      statusMessage:
        "Only Owner/Admin or the campaign manager can initiate a transfer",
    });
  }

  if (!targetOrgId || targetOrgId === campaign.organizationId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid target organization",
    });
  }
  const targetOrg = await sqlGet<{ id: string; name: string }>(
    "SELECT id, name FROM organization WHERE id = $1",
    [targetOrgId],
  );
  if (!targetOrg) {
    throw createError({
      statusCode: 404,
      statusMessage: "Target organization not found",
    });
  }

  const repo = AppDataSource.getRepository(CampaignTransfer);
  const dup = await repo.findOneBy({
    campaignId,
    status: "pending",
  });
  if (dup) {
    throw createError({
      statusCode: 400,
      statusMessage: "This campaign already has a pending transfer request",
    });
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
  const admins = await sqlAll<{ userId: string }>(
    "SELECT \"userId\" FROM member WHERE \"organizationId\" = $1 AND role IN ('owner','admin')",
    [targetOrgId],
  );
  const fromOrg = await sqlGet<{ name: string }>(
    "SELECT name FROM organization WHERE id = $1",
    [campaign.organizationId!],
  );
  for (const a of admins) {
    notify(a.userId, "transfer.incoming", {
      link: "/organizations",
      data: {
        campaign: campaign.name || campaign.expectedTitle,
        from: fromOrg,
      },
    });
  }

  return { ok: true, transfer_id: tr.id };
}
