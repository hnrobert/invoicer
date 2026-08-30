// API layer: parse the request, delegate to server/service.
import { getSessionUser } from "#server/utils/campaign";
import { setOrgVisibility } from "#server/service/orgs/org";

/** PUT /api/orgs/:orgId/visibility — set org visibility (Owner/Admin). */
export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, "orgId")!;
  const user = await getSessionUser(event);
  const body = await readBody<{ visibility?: string }>(event);
  return setOrgVisibility(orgId, user.id, body?.visibility);
});
