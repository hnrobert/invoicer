// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { listGroups } from "#server/service/campaigns/groups.service";

/** GET /api/campaigns/:id/groups — groups with reviewer assignments. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  await requireCampaignAccess(event, campaignId);
  return listGroups(campaignId);
});
