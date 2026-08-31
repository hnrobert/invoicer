// API layer: parse the request, delegate to server/service.
import { requireCampaignAccess } from "#server/utils/campaign";
import { requestCampaignTransfer } from "#server/service/campaigns/transfer.service";
import type { TransferRequestBody } from "#shared/api";

/** POST /api/campaigns/:id/transfer — initiate a cross-org transfer. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { user, campaign, rights } = await requireCampaignAccess(
    event,
    campaignId,
  );
  const { target_org_id } = await readBody<TransferRequestBody>(event);
  return requestCampaignTransfer(user, campaign, rights, target_org_id);
});
