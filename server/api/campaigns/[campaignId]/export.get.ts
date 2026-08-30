// API layer: parse the request, delegate to server/service, shape download.
import { requireCampaignAccess } from "#server/utils/campaign";
import {
  exportCampaign,
  type ExportFormat,
} from "#server/service/campaigns/exportFiles";

/** GET /api/campaigns/:id/export?format=csv|xlsx|zip — audit-logged export. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const format = (getQuery(event).format ?? "csv").toString();
  if (!["csv", "xlsx", "zip"].includes(format)) {
    throw createError({
      statusCode: 400,
      statusMessage: "format must be csv / xlsx / zip",
    });
  }
  const { user, campaign, rights } = await requireCampaignAccess(
    event,
    campaignId,
  );
  const { body, contentType, filename } = await exportCampaign(
    user,
    campaign,
    rights,
    format as ExportFormat,
  );
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
