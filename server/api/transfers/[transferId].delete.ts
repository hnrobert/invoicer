import { AppDataSource } from "#server/utils/database";
import { CampaignTransfer } from "#server/entities/campaignTransfer.entity";
import { getOrgRole, getSessionUser } from "#server/utils/campaign";
import { logAudit } from "#server/utils/audit";
import { notify } from "#server/utils/notify";

/** Cancel/reject a pending transfer — either side's Owner/Admin or the requester. */
export default defineEventHandler(async (event) => {
  const transferId = Number(getRouterParam(event, "transferId"));
  const user = await getSessionUser(event);

  const repo = AppDataSource.getRepository(CampaignTransfer);
  const tr = await repo.findOneBy({ id: transferId });
  if (!tr) throw createError({ statusCode: 404, statusMessage: "Transfer request not found" });
  if (tr.status !== "pending") {
    throw createError({ statusCode: 400, statusMessage: "This request has already been processed" });
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
});
