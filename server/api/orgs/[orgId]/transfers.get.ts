// API layer: parse the request, delegate to server/service.
import { getSessionUser } from "#server/utils/campaign";
import { listOrgTransfers } from "#server/service/orgs/org";

/** GET /api/orgs/:orgId/transfers — pending transfers (Owner/Admin). */
export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, "orgId")!;
  const user = await getSessionUser(event);
  return listOrgTransfers(orgId, user.id);
});
