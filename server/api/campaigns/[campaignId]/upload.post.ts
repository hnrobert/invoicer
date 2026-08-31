// API layer: parse multipart, delegate persistence + recognition kickoff.
import { requireCampaignAccess } from "#server/utils/campaign";
import { uploadInvoices } from "#server/service/campaigns/upload.service";

/**
 * POST /api/campaigns/:id/upload — upload invoice files (PDF / image / 数电票).
 * Non-file parts and unsupported types are filtered inside the service.
 */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { user, rights } = await requireCampaignAccess(event, campaignId);
  if (!rights.canUpload) {
    throw createError({
      statusCode: 403,
      statusMessage:
        "Uploads are currently closed for this campaign (not open, closed, or archived)",
    });
  }

  const form = await readMultipartFormData(event);
  if (!form)
    throw createError({
      statusCode: 400,
      statusMessage: "No upload content received",
    });

  const files = form
    .filter((f) => !!f.filename)
    .map((f) => ({ filename: f.filename!, data: f.data }));
  if (files.length === 0)
    throw createError({ statusCode: 400, statusMessage: "No files uploaded" });

  const results = await uploadInvoices(user, campaignId, files);
  if (results.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "No PDF, image, or digital-invoice (XML/OFD) files detected",
    });
  }
  return { ok: true, results };
});
