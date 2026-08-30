// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { reviewInvoice } from "#server/service/campaigns/review";

/** POST /api/campaigns/:id/review/:invoiceId — approve/reject an invoice. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const invoiceId = Number(getRouterParam(event, "invoiceId"));
  const { user, campaign, rights } = await requireCampaignAccess(
    event,
    campaignId,
  );
  const body = await readBody<{
    decision?: string;
    manual_amount?: number | string;
  }>(event);
  return reviewInvoice(user, campaign, rights, invoiceId, body);
});
