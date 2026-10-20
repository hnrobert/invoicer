// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { deleteInvoice } from "#server/service/campaigns/clear.service";

/** DELETE /api/campaigns/:id/invoices/:invoiceId — drop one file + record. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const invoiceId = Number(getRouterParam(event, "invoiceId"));
  const { user, campaign, rights } = await requireCampaignAccess(
    event,
    campaignId,
  );
  return deleteInvoice(user, campaign, rights, invoiceId);
});
