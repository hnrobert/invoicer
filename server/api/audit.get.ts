// API layer: parse the request, delegate to server/service.
import { getSessionUser } from "#server/utils/campaign";
import { queryAudit } from "#server/service/audit/audit.service";

/** GET /api/audit?campaignId=|orgId= — audit trail (privileged). */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const q = getQuery(event);
  const campaignId = q.campaignId ? Number(q.campaignId) : null;
  const orgId = typeof q.orgId === "string" ? q.orgId : null;
  return queryAudit(user, campaignId, orgId);
});
