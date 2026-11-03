// API layer: parse the request, delegate to server/service.
import { getSessionUser } from "#server/utils/campaign";
import { getOrgSignature } from "#server/service/orgs/org.service";

/** GET /api/orgs/:orgId/signature — head signature data URL (members). */
export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, "orgId")!;
  const user = await getSessionUser(event);
  return getOrgSignature(orgId, user.id);
});
