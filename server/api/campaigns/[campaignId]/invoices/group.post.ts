// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { assignInvoicesToGroup } from "#server/service/campaigns/groups";

/** POST /api/campaigns/:id/invoices/group — assign invoices to a group. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { rights } = await requireCampaignAccess(event, campaignId);
  const body = await readBody<{
    invoiceIds?: number[];
    groupId?: number | null;
  }>(event);
  return assignInvoicesToGroup(
    rights,
    campaignId,
    body?.invoiceIds,
    body?.groupId,
  );
});
