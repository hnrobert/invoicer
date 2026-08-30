// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { campaignDetail } from "#server/service/campaigns/detail";

/** GET /api/campaigns/:id — invoice list + totals, scoped by rights. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { user, campaign, rights } = await requireCampaignAccess(
    event,
    campaignId,
  );
  return campaignDetail(user, campaign, rights);
});
