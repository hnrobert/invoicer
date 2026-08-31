// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { updateCampaignSettings } from "#server/service/campaigns/settings";
import type { UpdateCampaignBody } from "#shared/api";

/** PUT /api/campaigns/:id — update visibility/searchable/status/deadline/name. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { user, campaign, rights } = await requireCampaignAccess(
    event,
    campaignId,
  );
  const body = await readBody<UpdateCampaignBody>(event);
  return updateCampaignSettings(user, campaign, rights, body);
});
