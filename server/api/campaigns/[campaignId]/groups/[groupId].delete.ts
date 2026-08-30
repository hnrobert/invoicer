// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { deleteGroup } from "#server/service/campaigns/groups";

/** DELETE /api/campaigns/:id/groups/:groupId — delete a group. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const groupId = Number(getRouterParam(event, "groupId"));
  const { user, campaign, rights } = await requireCampaignAccess(
    event,
    campaignId,
  );
  return deleteGroup(user, campaign, rights, groupId);
});
