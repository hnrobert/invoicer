// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { clearUploads } from "#server/service/campaigns/clear";

/** POST /api/campaigns/:id/clear — remove uploads (all or own, by rights). */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { user, rights } = await requireCampaignAccess(event, campaignId);
  return clearUploads(user, campaignId, rights);
});
