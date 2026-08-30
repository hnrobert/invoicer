// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { submitAllInvoices } from "#server/service/campaigns/submit";

/** POST /api/campaigns/:id/submit-all — submit every own submittable draft. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { user } = await requireCampaignAccess(event, campaignId);
  return submitAllInvoices(user, campaignId);
});
