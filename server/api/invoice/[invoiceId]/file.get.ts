// API layer: resolve campaign context, delegate to server/service, shape the
// stream/redirect — bytes never buffered here.
import { requireCampaignAccess } from "#server/utils/campaign";
import {
  invoiceCampaignId,
  invoiceFileStream,
} from "#server/service/invoice/files.service";

/**
 * GET /api/invoice/:id/file — serve the original file for inline preview.
 * S3 objects redirect to a presigned URL (bytes bypass node); everything
 * else proxies through as a stream.
 */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, "invoiceId"));
  const campaignId = await invoiceCampaignId(id);
  const { user, rights } = await requireCampaignAccess(event, campaignId);
  const res = await invoiceFileStream(user, rights, id);
  if (res.kind === "redirect") return sendRedirect(event, res.url);
  setHeader(event, "Content-Type", res.mime);
  setHeader(event, "Content-Length", res.size);
  return sendStream(event, await res.open());
});
