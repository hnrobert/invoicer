import { In, IsNull, type FindOptionsWhere } from "typeorm";
import { AppDataSource } from "#server/utils/database";
import { Campaign } from "#server/entities/campaign.entity";
import { CampaignCollaborator } from "#server/entities/campaignCollaborator.entity";
import { getSessionUser, getUserOrgIds } from "#server/utils/campaign";
import { authDb } from "#server/utils/auth";
import type { CampaignPublic } from "#shared/types";

/** org slug lookup (for client-side /orgs/[slug]/campaigns/[id] links). */
function orgSlug(organizationId: string | null): string | null {
  if (!organizationId) return null;
  const row = authDb
    .prepare("SELECT slug FROM organization WHERE id = ?")
    .get(organizationId) as { slug: string } | undefined;
  return row?.slug ?? null;
}

function toPublic(c: Campaign): CampaignPublic {
  return {
    id: c.id,
    userId: c.userId,
    organizationId: c.organizationId,
    orgSlug: orgSlug(c.organizationId),
    name: c.name,
    expectedTitle: c.expectedTitle,
    expectedTaxId: c.expectedTaxId,
    visibility: c.visibility,
    searchable: c.searchable,
    status: c.status,
    visibilityConfirmed: c.visibilityConfirmed,
    createdAt: c.createdAt.toISOString(),
  };
}

/**
 * List every campaign the caller may access: their personal campaigns
 * (`organizationId` IS NULL AND owned by them), every campaign owned by an
 * organization they belong to, and every campaign they collaborate on
 * (typically org outsiders). Personal and org campaigns are returned in
 * separate arrays so the client can group them; collaborations get their own.
 */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const orgIds = getUserOrgIds(user.id);

  // Personal campaigns (organizationId IS NULL) OR campaigns owned by any org
  // the user is a member of. TypeORM needs IsNull() to match a NULL column.
  const where: FindOptionsWhere<Campaign>[] = [
    { userId: user.id, organizationId: IsNull() },
  ];
  if (orgIds.length) where.push({ organizationId: In(orgIds) });

  const all = await AppDataSource.getRepository(Campaign).find({
    where,
    order: { createdAt: "desc" },
  });

  const personal: CampaignPublic[] = [];
  const byOrg: CampaignPublic[] = [];
  for (const c of all) {
    (c.organizationId ? byOrg : personal).push(toPublic(c));
  }

  // Collaborations: campaigns the user was added to directly. Archived ones
  // are hidden (requireCampaignAccess would 403 them anyway on open).
  const collabRows = await AppDataSource.getRepository(
    CampaignCollaborator,
  ).find({ where: { userId: user.id } });
  const collabIds = collabRows.map((r) => r.campaignId);
  const collaborations = collabIds.length
    ? (
        await AppDataSource.getRepository(Campaign).find({
          where: { id: In(collabIds), status: In(["active", "closed"]) },
          order: { createdAt: "desc" },
        })
      ).map((c) => toPublic(c))
    : [];

  return { ok: true, personal, organizations: byOrg, collaborations };
});
