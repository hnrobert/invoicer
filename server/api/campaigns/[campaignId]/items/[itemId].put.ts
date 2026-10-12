// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { updateItem } from "#server/service/campaigns/items.service";
import type { ItemUpdateBody } from "#shared/api";

/** PUT /api/campaigns/:id/items/:itemId — update fields of one item. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const itemId = Number(getRouterParam(event, "itemId"));
  const { user, campaign, rights } = await requireCampaignAccess(
    event,
    campaignId,
  );
  const body = await readBody<ItemUpdateBody>(event);
  return updateItem(user, campaign, rights, itemId, body);
});
