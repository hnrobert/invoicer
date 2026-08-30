// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { removeGroupReviewer } from "#server/service/campaigns/groups";

/** DELETE .../reviewers/:userId — remove a reviewer from a group. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const groupId = Number(getRouterParam(event, "groupId"));
  const userId = getRouterParam(event, "userId")!;
  const { user, campaign, rights } = await requireCampaignAccess(
    event,
    campaignId,
  );
  return removeGroupReviewer(user, campaign, rights, groupId, userId);
});
