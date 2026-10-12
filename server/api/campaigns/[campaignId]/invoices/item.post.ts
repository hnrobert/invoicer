// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { assignInvoicesToItem } from "#server/service/campaigns/items.service";
import type { AssignItemBody } from "#shared/api";

/** POST /api/campaigns/:id/invoices/item — attach invoices to an item. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { rights } = await requireCampaignAccess(event, campaignId);
  const body = await readBody<AssignItemBody>(event);
  return assignInvoicesToItem(rights, campaignId, body);
});
