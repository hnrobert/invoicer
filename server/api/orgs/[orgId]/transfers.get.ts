import { In } from "typeorm";
import { AppDataSource } from "#server/utils/database";
import { CampaignTransfer } from "#server/entities/campaignTransfer.entity";
import { Campaign } from "#server/entities/campaign.entity";
import { getOrgRole, getSessionUser } from "#server/utils/campaign";
import { sqlGet } from "#server/utils/auth";

/**
 * Pending transfers TO one org (for the accept/reject UI) plus outgoing
 * pending ones FROM it. Owner/Admin only.
 */
export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, "orgId")!;
  const user = await getSessionUser(event);
  const role = await getOrgRole(orgId, user.id);
  if (role !== "owner" && role !== "admin") {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }
  const rows = (
    await AppDataSource.getRepository(CampaignTransfer).find({
      where: [{ toOrganizationId: orgId }, { fromOrganizationId: orgId }],
      order: { id: "desc" },
      take: 100,
    })
  ).filter((r) => r.status === "pending");

  const campaignIds = [...new Set(rows.map((r) => r.campaignId))];
  const campaigns = campaignIds.length
    ? await AppDataSource.getRepository(Campaign).find({
        where: { id: In(campaignIds) },
      })
    : [];
  const campaignName = new Map(
    campaigns.map((c) => [c.id, c.name || c.expectedTitle]),
  );
  const orgIds = [
    ...new Set(rows.flatMap((r) => [r.fromOrganizationId, r.toOrganizationId])),
  ];
  const orgNames = new Map(
    orgIds.map((id) => [id, id]), // fallback: the id itself
  );
  await Promise.all(
    orgIds.map(async (id) => {
      const row = await sqlGet<{ name: string }>(
        "SELECT name FROM organization WHERE id = $1",
        [id],
      );
      if (row) orgNames.set(id, row.name);
    }),
  );

  return {
    ok: true,
    transfers: rows.map((r) => ({
      id: r.id,
      campaignId: r.campaignId,
      campaign: campaignName.get(r.campaignId) ?? `#${r.campaignId}`,
      incoming: r.toOrganizationId === orgId,
      fromOrg: orgNames.get(r.fromOrganizationId) ?? r.fromOrganizationId,
      toOrg: orgNames.get(r.toOrganizationId) ?? r.toOrganizationId,
      createdAt: r.createdAt.toISOString(),
    })),
  };
});
