import { AppDataSource } from "#server/utils/database";
import { Campaign } from "#server/entities/campaign.entity";
import { CampaignTransfer } from "#server/entities/campaignTransfer.entity";
import { getOrgRole } from "#server/utils/campaign";
import { logAudit } from "#server/utils/audit";
import { notify } from "#server/utils/notify";
import type { OkResponse } from "#shared/api";
import type { AuthUser } from "#shared/types";

/**
 * Accept a pending cross-org transfer (target org Owner/Admin only). Moves the
 * campaign — invoices and collaborators follow via campaignId — to the target
 * org. The campaign keeps its visibility settings; an unconfirmed (legacy)
 * campaign stays unconfirmed so its semantics don't shift mid-move.
 */
export async function acceptTransfer(
  user: Pick<AuthUser, "id">,
  transferId: number,
): Promise<OkResponse> {
  const repo = AppDataSource.getRepository(CampaignTransfer);
  const tr = await repo.findOneBy({ id: transferId });
  if (!tr)
    throw createError({
      statusCode: 404,
      statusMessage: "Transfer request not found",
    });
  if (tr.status !== "pending") {
    throw createError({
      statusCode: 400,
      statusMessage: "This request has already been processed",
    });
  }
  const role = await getOrgRole(tr.toOrganizationId, user.id);
  if (role !== "owner" && role !== "admin") {
    throw createError({
      statusCode: 403,
      statusMessage: "Only the target org's Owner/Admin can accept",
    });
  }

  const campaignRepo = AppDataSource.getRepository(Campaign);
  const campaign = await campaignRepo.findOneBy({ id: tr.campaignId });
  if (!campaign) {
    throw createError({ statusCode: 404, statusMessage: "Campaign not found" });
  }

  await campaignRepo.update(
    { id: tr.campaignId },
    { organizationId: tr.toOrganizationId },
  );
  await repo.update({ id: transferId }, { status: "accepted" });

  logAudit({
    organizationId: tr.toOrganizationId,
    campaignId: tr.campaignId,
    actorId: user.id,
    action: "campaign.transfer.accept",
    target: `from org ${tr.fromOrganizationId}`,
  });
  logAudit({
    organizationId: tr.fromOrganizationId,
    campaignId: tr.campaignId,
    actorId: user.id,
    action: "campaign.transfer.accept",
    target: `to org ${tr.toOrganizationId}`,
  });
  notify(tr.requestedBy, "transfer.accepted", {
    data: { campaign: campaign.name || campaign.expectedTitle },
  });

  return { ok: true };
}

/** Cancel/reject a pending transfer — either side's Owner/Admin or the requester. */
export async function cancelTransfer(
  user: Pick<AuthUser, "id">,
  transferId: number,
): Promise<OkResponse> {
  const repo = AppDataSource.getRepository(CampaignTransfer);
  const tr = await repo.findOneBy({ id: transferId });
  if (!tr)
    throw createError({
      statusCode: 404,
      statusMessage: "Transfer request not found",
    });
  if (tr.status !== "pending") {
    throw createError({
      statusCode: 400,
      statusMessage: "This request has already been processed",
    });
  }
  const fromRole = await getOrgRole(tr.fromOrganizationId, user.id);
  const toRole = await getOrgRole(tr.toOrganizationId, user.id);
  const allowed =
    tr.requestedBy === user.id ||
    fromRole === "owner" ||
    fromRole === "admin" ||
    toRole === "owner" ||
    toRole === "admin";
  if (!allowed) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }

  await repo.update({ id: transferId }, { status: "canceled" });
  logAudit({
    organizationId: tr.fromOrganizationId,
    campaignId: tr.campaignId,
    actorId: user.id,
    action: "campaign.transfer.cancel",
  });
  if (tr.requestedBy !== user.id) {
    notify(tr.requestedBy, "transfer.canceled", {});
  }
  return { ok: true };
}
