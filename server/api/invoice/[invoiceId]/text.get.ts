// API layer: resolve campaign context, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import {
  invoiceCampaignId,
  invoiceRawText,
} from "#server/service/invoice/files";

/** GET /api/invoice/:id/text — raw extraction/OCR text. */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, "invoiceId"));
  const campaignId = await invoiceCampaignId(id);
  const { user, rights } = await requireCampaignAccess(event, campaignId);
  return invoiceRawText(user, rights, id);
});
