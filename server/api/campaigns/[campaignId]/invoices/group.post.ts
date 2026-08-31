// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { assignInvoicesToGroup } from "#server/service/campaigns/groups";
import type { AssignGroupBody } from "#shared/api";

/** POST /api/campaigns/:id/invoices/group — assign invoices to a group. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { rights } = await requireCampaignAccess(event, campaignId);
  const body = await readBody<AssignGroupBody>(event);
  return assignInvoicesToGroup(rights, campaignId, body);
});
