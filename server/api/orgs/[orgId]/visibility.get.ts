// API layer: parse the request, delegate to server/service.
import { getSessionUser } from "#server/utils/campaign";
import { getOrgVisibility } from "#server/service/orgs/org";

/** GET /api/orgs/:orgId/visibility — read org visibility (members). */
export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, "orgId")!;
  const user = await getSessionUser(event);
  return getOrgVisibility(orgId, user.id);
});
