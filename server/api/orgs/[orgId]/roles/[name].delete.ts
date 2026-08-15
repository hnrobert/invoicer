import { AppDataSource } from "#server/utils/database";
import { OrgCustomRole } from "#server/entities/orgCustomRole.entity";
import { getOrgRole, getSessionUser } from "#server/utils/campaign";
import { authDb } from "#server/utils/auth";
import { logAudit } from "#server/utils/audit";

/**
 * Delete a custom role (Owner only). Members still carrying the name are
 * demoted to plain `member` so no one is left with an unresolvable role.
 */
export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, "orgId")!;
  const name = getRouterParam(event, "name")!;
  const user = await getSessionUser(event);
  const role = await getOrgRole(orgId, user.id);
  if (role !== "owner") {
    throw createError({ statusCode: 403, statusMessage: "Only the organization owner can manage custom roles" });
  }
  const repo = AppDataSource.getRepository(OrgCustomRole);
  const existing = await repo.findOneBy({ organizationId: orgId, name });
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: "Role not found" });
  }
  await repo.delete({ organizationId: orgId, name });
  // Demote anyone still assigned the deleted name (Better Auth member table).
  authDb
    .prepare(
      "UPDATE member SET role = 'member' WHERE organizationId = ? AND role = ?",
    )
    .run(orgId, name);
  logAudit({
    organizationId: orgId,
    actorId: user.id,
    action: "org.customRole.delete",
    target: name,
  });
  return { ok: true };
});
