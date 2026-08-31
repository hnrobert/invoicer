// API layer: parse the request, delegate to server/service.
import { getSessionUser } from "#server/utils/campaign";
import { createRole } from "#server/service/orgs/roles";
import type { RoleCreateBody } from "#shared/api";

/** POST /api/orgs/:orgId/roles — create a custom role. */
export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, "orgId")!;
  const user = await getSessionUser(event);
  const body = await readBody<RoleCreateBody>(event);
  return createRole(user, orgId, body);
});
