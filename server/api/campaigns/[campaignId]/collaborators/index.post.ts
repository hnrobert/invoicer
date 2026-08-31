// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { addCollaborator } from "#server/service/campaigns/collaborators";
import type { EmailBody } from "#shared/api";

/** POST /api/campaigns/:id/collaborators — add a collaborator by email. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { user, campaign, rights } = await requireCampaignAccess(
    event,
    campaignId,
  );
  const { email } = await readBody<EmailBody>(event);
  return addCollaborator(user, campaign, rights, email);
});
