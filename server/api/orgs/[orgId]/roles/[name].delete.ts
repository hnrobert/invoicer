// API layer: parse the request, delegate to server/service.
import { getSessionUser } from "#server/utils/campaign";
import { deleteRole } from "#server/service/orgs/roles";

/** DELETE /api/orgs/:orgId/roles/:name — delete a custom role. */
export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, "orgId")!;
  const name = getRouterParam(event, "name")!;
  const user = await getSessionUser(event);
  return deleteRole(user, orgId, name);
});
