// API layer: parse the request, delegate to server/service.
import { getSessionUser } from "#server/utils/campaign";
import { createCampaign } from "#server/service/campaigns/create";

/** POST /api/campaign — create a reimbursement campaign. */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const body = await readBody<{
    title?: string;
    tax_id?: string;
    organization_id?: string;
    name?: string;
    title_ids?: number[];
  }>(event);
  const campaignId = await createCampaign(user, body);
  return { ok: true, campaign_id: campaignId };
});
