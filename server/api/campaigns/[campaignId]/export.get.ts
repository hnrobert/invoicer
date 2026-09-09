// API layer: parse the request, delegate to server/service, shape download.
import { requireCampaignAccess } from "#server/utils/campaign";
import {
  exportCampaign,
  type ExportFormat,
} from "#server/service/campaigns/exportFiles.service";

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
  // HTTP headers are ByteStrings — a Chinese campaign name in filename=
  // throws. Send an ASCII fallback plus the RFC 5987 encoded form (what
  // browsers prefer when both are present).
  const asciiFallback = filename
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/"/g, "'");
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
});
