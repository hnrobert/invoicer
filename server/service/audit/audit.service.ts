import { AppDataSource } from "#server/utils/database";
import { AuditLog } from "#server/entities/auditLog.entity";
import { Campaign } from "#server/entities/campaign.entity";
import { getOrgRole } from "#server/utils/campaign";
import { sqlAll } from "#server/utils/auth";
import type { AuditResponse } from "#shared/api";
import type { AuthUser } from "#shared/types";

/**
 * Query the audit trail. `campaignId` scopes to one campaign (its manager,
 * or the owning org's Owner/Admin); `orgId` scopes to an org (Owner/Admin).
 * Returns newest-first with actor names resolved.
 */
export async function queryAudit(
  user: Pick<AuthUser, "id">,
  campaignId: number | null,
  orgId: string | null,
): Promise<AuditResponse> {
  if (!campaignId && !orgId) {
    throw createError({
      statusCode: 400,
      statusMessage: "campaignId or orgId is required",
    });
  }

  if (campaignId) {
    const campaign = await AppDataSource.getRepository(Campaign).findOneBy({
      id: campaignId,
    });
    if (!campaign) {
      throw createError({
        statusCode: 404,
        statusMessage: "Campaign not found",
      });
    }
    const role = campaign.organizationId
      ? await getOrgRole(campaign.organizationId, user.id)
      : null;
    const allowed =
      campaign.userId === user.id || role === "owner" || role === "admin";
    if (!allowed) {
      throw createError({ statusCode: 403, statusMessage: "Forbidden" });
    }
  } else if (orgId) {
    const role = await getOrgRole(orgId, user.id);
    if (role !== "owner" && role !== "admin") {
      throw createError({ statusCode: 403, statusMessage: "Forbidden" });
    }
  }

  const rows = await AppDataSource.getRepository(AuditLog).find({
    where: campaignId ? { campaignId } : { organizationId: orgId! },
    order: { id: "desc" },
    take: 200,
  });

  const ids = [...new Set(rows.map((r) => r.actorId))];
  const users = ids.length
    ? await sqlAll<{ id: string; name: string; email: string }>(
        `SELECT id, name, email FROM "user" WHERE id IN (${ids.map((_, i) => `$${i + 1}`).join(",")})`,
        ids,
      )
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));

  return {
    ok: true,
    logs: rows.map((r) => ({
      id: r.id,
      action: r.action,
      target: r.target,
      meta: JSON.parse(r.meta) as Record<string, unknown>,
      actorName: byId.get(r.actorId)?.name ?? r.actorId,
      actorEmail: byId.get(r.actorId)?.email ?? "",
      campaignId: r.campaignId,
      organizationId: r.organizationId,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
