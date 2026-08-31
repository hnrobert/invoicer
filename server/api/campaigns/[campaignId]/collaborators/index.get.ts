// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { listCollaborators } from "#server/service/campaigns/collaborators.service";

/** GET /api/campaigns/:id/collaborators — list collaborators. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { rights } = await requireCampaignAccess(event, campaignId);
  return listCollaborators(campaignId, rights);
});
