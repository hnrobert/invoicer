// API layer: parse the request, delegate to server/service.
import { getSessionUser } from "#server/utils/campaign";
import { setOrgSignature } from "#server/service/orgs/org.service";
import type { OrgSignatureBody } from "#shared/api";

/** PUT /api/orgs/:orgId/signature — {data: dataUrl|null} (Owner/Admin). */
export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, "orgId")!;
  const user = await getSessionUser(event);
  const body = await readBody<OrgSignatureBody>(event);
  return setOrgSignature(orgId, user.id, body?.data ?? null);
});
