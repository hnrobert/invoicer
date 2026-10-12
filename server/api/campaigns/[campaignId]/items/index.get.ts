// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { listItems } from "#server/service/campaigns/items.service";

/** GET /api/campaigns/:id/items — the campaign's reimbursement items. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  await requireCampaignAccess(event, campaignId);
  return listItems(campaignId);
});
