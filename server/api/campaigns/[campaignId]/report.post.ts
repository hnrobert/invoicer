// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { sendCampaignReport } from "#server/service/campaigns/report";

/** POST /api/campaigns/:id/report — email the audit report to a recipient. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { user, campaign, rights } = await requireCampaignAccess(
    event,
    campaignId,
  );
  const { to } = await readBody<{ to?: string }>(event);
  return sendCampaignReport(user, campaign, rights, (to ?? "").trim());
});
