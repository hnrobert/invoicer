// API layer: parse the request, delegate to server/service.
import { getSessionUser } from "#server/utils/campaign";
import { createCampaign } from "#server/service/campaigns/create.service";
import type { CreateCampaignBody } from "#shared/api";

/** POST /api/campaign — create a reimbursement campaign. */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const body = await readBody<CreateCampaignBody>(event);
  return createCampaign(user, body);
});
