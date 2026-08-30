import { AppDataSource } from "#server/utils/database";
import { OrgCustomRole } from "#server/entities/orgCustomRole.entity";
import { getSessionUser } from "#server/utils/campaign";
import { sqlRun } from "#server/utils/auth";
import { logAudit } from "#server/utils/audit";
import { getOrgPermissions } from "#server/utils/orgPermissions";

/**
 * Delete a custom role (Owner only). Members still carrying the name are
 * demoted to plain `member` so no one is left with an unresolvable role.
 */
export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, "orgId")!;
  const name = getRouterParam(event, "name")!;
  const user = await getSessionUser(event);
  if (!(await getOrgPermissions(orgId, user.id)).has("org.role.manage")) {
    throw createError({
      statusCode: 403,
      statusMessage: "Only the organization owner can manage custom roles",
    });
  }
  const repo = AppDataSource.getRepository(OrgCustomRole);
  const existing = await repo.findOneBy({ organizationId: orgId, name });
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: "Role not found" });
  }
  await repo.delete({ organizationId: orgId, name });
  // Demote anyone still assigned the deleted name (Better Auth member table).
  await sqlRun(
    "UPDATE member SET role = 'member' WHERE organizationId = $1 AND role = $2",
    [orgId, name],
  );
  logAudit({
    organizationId: orgId,
    actorId: user.id,
    action: "org.customRole.delete",
    target: name,
  });
  return { ok: true };
});
