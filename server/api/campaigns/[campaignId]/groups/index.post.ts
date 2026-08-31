// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { createGroup } from "#server/service/campaigns/groups.service";
import type { GroupCreateBody } from "#shared/api";

/** POST /api/campaigns/:id/groups — create a group. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { user, campaign, rights } = await requireCampaignAccess(
    event,
    campaignId,
  );
  const { name } = await readBody<GroupCreateBody>(event);
  return createGroup(user, campaign, rights, name);
});
