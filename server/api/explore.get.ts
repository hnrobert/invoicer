// API layer: parse the request, delegate to server/service.
import { getSessionUser } from "#server/utils/campaign";
import { exploreCampaigns } from "#server/service/explore/explore.service";

/** GET /api/explore?q= — the public campaign plaza (login required). */
export default defineEventHandler(async (event) => {
  await getSessionUser(event);
  const q = (getQuery(event).q ?? "").toString().trim();
  return exploreCampaigns(q);
});
