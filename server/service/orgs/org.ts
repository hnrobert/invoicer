import { In } from "typeorm";
import { AppDataSource } from "#server/utils/database";
import { OrgSetting } from "#server/entities/orgSetting.entity";
import { CampaignTransfer } from "#server/entities/campaignTransfer.entity";
import { Campaign } from "#server/entities/campaign.entity";
import { getOrgRole } from "#server/utils/campaign";
import { sqlGet } from "#server/utils/auth";

/** Read an org's platform visibility (members only; defaults to public). */
export async function getOrgVisibility(orgId: string, userId: string) {
  if (!(await getOrgRole(orgId, userId))) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }
  const setting = await AppDataSource.getRepository(OrgSetting).findOneBy({
    organizationId: orgId,
  });
  return { ok: true as const, visibility: setting?.visibility ?? "public" };
}

/**
 * Set an organization's platform visibility (public / private). Owner or
 * Admin only. Private orgs keep their campaigns off the explore plaza; their
 * public campaigns stay reachable by direct link.
 */
export async function setOrgVisibility(
  orgId: string,
  userId: string,
  visibility: string | undefined,
) {
  const role = await getOrgRole(orgId, userId);
  if (role !== "owner" && role !== "admin") {
    throw createError({
      statusCode: 403,
      statusMessage: "Only Owner/Admin can change organization visibility",
    });
  }
  if (visibility !== "public" && visibility !== "private") {
    throw createError({
      statusCode: 400,
      statusMessage: "visibility must be public or private",
    });
  }

  const repo = AppDataSource.getRepository(OrgSetting);
  const existing = await repo.findOneBy({ organizationId: orgId });
  const saved = await repo.save({
    ...(existing ?? { organizationId: orgId }),
    visibility,
  });
  return { ok: true as const, visibility: saved.visibility };
}

/**
 * Pending transfers TO one org (for the accept/reject UI) plus outgoing
 * pending ones FROM it. Owner/Admin only.
 */
export async function listOrgTransfers(orgId: string, userId: string) {
  const role = await getOrgRole(orgId, userId);
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
  const orgNames = new Map(orgIds.map((id) => [id, id])); // fallback: the id
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
    ok: true as const,
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
}
