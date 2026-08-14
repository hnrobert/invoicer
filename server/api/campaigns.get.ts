import { In, IsNull, type FindOptionsWhere } from "typeorm";
import { AppDataSource } from "#server/utils/database";
import { Campaign } from "#server/entities/campaign.entity";
import { getSessionUser, getUserOrgIds } from "#server/utils/campaign";
import type { CampaignPublic } from "#shared/types";

function toPublic(c: Campaign): CampaignPublic {
  return {
    id: c.id,
    userId: c.userId,
    organizationId: c.organizationId,
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
 * (`organizationId` IS NULL AND owned by them) plus every campaign owned by an
 * organization they belong to. Personal and org campaigns are returned in
 * separate arrays so the client can group them.
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
  return { ok: true, personal, organizations: byOrg };
});
