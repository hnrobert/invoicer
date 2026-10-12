// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { createItem } from "#server/service/campaigns/items.service";
import type { ItemCreateBody } from "#shared/api";

/** POST /api/campaigns/:id/items — create a reimbursement item. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { user, campaign, rights } = await requireCampaignAccess(
    event,
    campaignId,
  );
  const body = await readBody<ItemCreateBody>(event);
  return createItem(user, campaign, rights, body);
});
