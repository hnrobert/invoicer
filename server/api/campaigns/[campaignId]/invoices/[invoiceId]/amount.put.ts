// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { setInvoiceAmount } from "#server/service/campaigns/amount.service";

/** PUT /api/campaigns/:id/invoices/:invoiceId/amount — {amount: number|null}.
 *  null reverts to the OCR-extracted value. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const invoiceId = Number(getRouterParam(event, "invoiceId"));
  const { user, campaign, rights } = await requireCampaignAccess(
    event,
    campaignId,
  );
  const body = await readBody<{ amount?: number | null }>(event);
  const raw = body?.amount;
  const amount = raw == null || raw === ("" as unknown) ? null : Number(raw);
  return setInvoiceAmount(user, campaign, rights, invoiceId, amount);
});
