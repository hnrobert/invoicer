// API layer: parse the request, delegate to server/service, shape nothing.
import { getSessionUser } from "#server/utils/campaign";
import { listCampaignsFor } from "#server/service/campaigns/list";

/** GET /api/campaigns — every campaign the caller may access, grouped. */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  return listCampaignsFor(user);
});
