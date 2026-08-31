// API layer: parse the request, delegate to server/service.
import { getOrgRole, getSessionUser } from "#server/utils/campaign";
import { listRoles } from "#server/service/orgs/roles.service";

/** GET /api/orgs/:orgId/roles — list custom roles (members only). */
export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, "orgId")!;
  const user = await getSessionUser(event);
  if (!(await getOrgRole(orgId, user.id))) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }
  return listRoles(orgId);
});
