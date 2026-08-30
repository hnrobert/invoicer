import { IsNull, Like, Not } from "typeorm";
import { AppDataSource } from "#server/utils/database";
import { Campaign } from "#server/entities/campaign.entity";
import { OrgSetting } from "#server/entities/orgSetting.entity";
import { getSessionUser } from "#server/utils/campaign";
import { sqlAll } from "#server/utils/auth";
import type { CampaignPublic } from "#shared/types";

function toPublic(
  c: Campaign,
  orgName: string | null,
  orgSlug: string | null,
): CampaignPublic & { orgName: string | null; orgSlug: string | null } {
  return {
    id: c.id,
    userId: c.userId,
    organizationId: c.organizationId,
    orgSlug,
    name: c.name,
    expectedTitle: c.expectedTitle,
    expectedTaxId: c.expectedTaxId,
    visibility: c.visibility,
    searchable: c.searchable,
    status: c.status,
    visibilityConfirmed: c.visibilityConfirmed,
    createdAt: c.createdAt.toISOString(),
    orgName,
  };
}

/**
 * The explore plaza: public + searchable campaigns of PUBLIC organizations.
 * Archived campaigns never appear; private orgs' campaigns never appear (their
 * public campaigns remain reachable by direct link, just not listed). Optional
 * `q` filters by campaign name or expected title (LIKE). Login is required —
 * public upload still only serves signed-in users.
 */
export default defineEventHandler(async (event) => {
  await getSessionUser(event);
  const q = (getQuery(event).q ?? "").toString().trim();

  // Private orgs are excluded from the plaza entirely.
  const privateOrgs = (
    await AppDataSource.getRepository(OrgSetting).find({
      where: { visibility: "private" },
    })
  ).map((s) => s.organizationId);

  const where: Record<string, unknown> = {
    organizationId: Not(IsNull()), // org campaigns only (personal are never public)
    visibility: "public",
    searchable: true,
    status: Not("archived"),
  };
  if (q) {
    const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    where.name = Like(like); // primary filter; title match folded in below
  }

  const rows = await AppDataSource.getRepository(Campaign).find({
    where,
    order: { createdAt: "desc" },
    take: 50,
  });

  // Post-filter: drop private orgs' campaigns, and match expectedTitle too
  // when a `q` is given (the DB LIKE covers name only).
  const qLower = q.toLowerCase();
  const filtered = rows.filter(
    (c) =>
      !privateOrgs.includes(c.organizationId!) &&
      (!q ||
        c.name.toLowerCase().includes(qLower) ||
        c.expectedTitle.toLowerCase().includes(qLower)),
  );

  // Resolve org names + slugs from Better Auth's organization table for display.
  const orgIds = [...new Set(filtered.map((c) => c.organizationId!))];
  const nameRows = orgIds.length
    ? await sqlAll<{ id: string; name: string; slug: string }>(
        `SELECT id, name, slug FROM organization WHERE id IN (${orgIds.map((_, i) => `$${i + 1}`).join(",")})`,
        orgIds,
      )
    : [];
  const names = new Map(nameRows.map((r) => [r.id, r]));

  return {
    ok: true,
    campaigns: filtered.map((c) =>
      toPublic(
        c,
        names.get(c.organizationId!)?.name ?? null,
        names.get(c.organizationId!)?.slug ?? null,
      ),
    ),
  };
});
