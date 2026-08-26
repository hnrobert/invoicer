import { AppDataSource } from "#server/utils/database";
import { OrgCustomRole } from "#server/entities/orgCustomRole.entity";
import { getSessionUser } from "#server/utils/campaign";
import { PERMISSIONS } from "#server/utils/orgPermissions";
import { logAudit } from "#server/utils/audit";

/** Edit a custom role's permission bundle (Owner only). */
export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, "orgId")!;
  const name = getRouterParam(event, "name")!;
  const user = await getSessionUser(event);
  if (!(await getOrgPermissions(orgId, user.id)).has("org.role.manage")) {
    throw createError({ statusCode: 403, statusMessage: "Owner only" });
  }
  const repo = AppDataSource.getRepository(OrgCustomRole);
  const existing = await repo.findOneBy({ organizationId: orgId, name });
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: "Role not found" });
  }
  const body = await readBody<{ permissions?: string[] }>(event);
  if (!Array.isArray(body?.permissions)) {
    throw createError({
      statusCode: 400,
      statusMessage: "permissions required",
    });
  }
  const clean = body.permissions.filter((p) =>
    (PERMISSIONS as readonly string[]).includes(p),
  );
  await repo.update(
    { organizationId: orgId, name },
    { permissions: JSON.stringify(clean) },
  );
  logAudit({
    organizationId: orgId,
    actorId: user.id,
    action: "org.customRole.update",
    target: name,
    meta: { permissions: clean },
  });
  return { ok: true };
});
