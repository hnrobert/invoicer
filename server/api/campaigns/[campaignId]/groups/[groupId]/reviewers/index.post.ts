// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { addGroupReviewer } from "#server/service/campaigns/groups";
import type { EmailBody } from "#shared/api";

/** POST /api/campaigns/:id/groups/:groupId/reviewers — assign a reviewer. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const groupId = Number(getRouterParam(event, "groupId"));
  const { user, campaign, rights } = await requireCampaignAccess(
    event,
    campaignId,
  );
  const { email } = await readBody<EmailBody>(event);
  return addGroupReviewer(user, campaign, rights, groupId, email);
});
