import { AppDataSource } from "#server/utils/database";
import { OrgCustomRole } from "#server/entities/orgCustomRole.entity";
import { getOrgRole, getSessionUser } from "#server/utils/campaign";

/** List the org's custom roles (any member may read — assignment UI needs it). */
export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, "orgId")!;
  const user = await getSessionUser(event);
  if (!(await getOrgRole(orgId, user.id))) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }
  const rows = await AppDataSource.getRepository(OrgCustomRole).find({
    where: { organizationId: orgId },
    order: { id: "asc" },
  });
  return {
    ok: true,
    roles: rows.map((r) => ({ name: r.name, baseRole: r.baseRole })),
  };
});
