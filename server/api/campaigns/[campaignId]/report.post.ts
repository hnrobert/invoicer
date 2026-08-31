// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { sendCampaignReport } from "#server/service/campaigns/report.service";
import type { RecipientBody } from "#shared/api";

/** POST /api/campaigns/:id/report — email the audit report to a recipient. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { user, campaign, rights } = await requireCampaignAccess(
    event,
    campaignId,
  );
  const { to } = await readBody<RecipientBody>(event);
  return sendCampaignReport(user, campaign, rights, (to ?? "").trim());
});
