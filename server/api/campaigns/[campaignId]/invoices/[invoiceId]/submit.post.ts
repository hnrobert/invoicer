// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { submitInvoice } from "#server/service/campaigns/submit.service";

/** POST /api/campaigns/:id/invoices/:invoiceId/submit — submit one draft. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const invoiceId = Number(getRouterParam(event, "invoiceId"));
  const { user, rights } = await requireCampaignAccess(event, campaignId);
  return submitInvoice(user, rights, campaignId, invoiceId);
});
