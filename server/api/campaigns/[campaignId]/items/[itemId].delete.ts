// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { deleteItem } from "#server/service/campaigns/items.service";

/** DELETE /api/campaigns/:id/items/:itemId — detach invoices, drop the item. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const itemId = Number(getRouterParam(event, "itemId"));
  const { user, campaign, rights } = await requireCampaignAccess(
    event,
    campaignId,
  );
  return deleteItem(user, campaign, rights, itemId);
});
