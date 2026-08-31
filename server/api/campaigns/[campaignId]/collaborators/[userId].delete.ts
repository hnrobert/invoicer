// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { removeCollaborator } from "#server/service/campaigns/collaborators.service";

/** DELETE /api/campaigns/:id/collaborators/:userId — remove a collaborator. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const userId = getRouterParam(event, "userId")!;
  const { user, campaign, rights } = await requireCampaignAccess(
    event,
    campaignId,
  );
  return removeCollaborator(user, campaign, rights, userId);
});
