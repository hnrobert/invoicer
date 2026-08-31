// API layer: parse the request, delegate to server/service.
import { getSessionUser } from "#server/utils/campaign";
import { updateRolePermissions } from "#server/service/orgs/roles.service";
import type { RoleUpdateBody } from "#shared/api";

/** PUT /api/orgs/:orgId/roles/:name — edit a role's permission bundle. */
export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, "orgId")!;
  const name = getRouterParam(event, "name")!;
  const user = await getSessionUser(event);
  const body = await readBody<RoleUpdateBody>(event);
  return updateRolePermissions(user, orgId, name, body);
});
