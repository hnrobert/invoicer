import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import { requireCampaignAccess } from "#server/utils/campaign";
import { mimeFor, storage } from "#server/utils/storage";

/**
 * Serve the original uploaded file for inline preview (campaign + invoice
 * access checked). In S3 mode the browser is redirected to a short-lived
 * presigned URL — bytes never touch the node process; otherwise (and for
 * legacy local paths) the file streams through as before.
 */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, "invoiceId"));
  const inv = await AppDataSource.getRepository(Invoice).findOneBy({ id });
  if (!inv)
    throw createError({ statusCode: 404, statusMessage: "Invoice not found" });

  // Access control: campaign access PLUS per-invoice isolation — the caller
  // must be the uploader or hold view-all rights (IDs are enumerable).
  const { user, rights } = await requireCampaignAccess(event, inv.campaignId);
  if (!rights.canViewAll && inv.uploaderId !== user.id) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }

  // S3 object: hand the browser a presigned URL (SeaweedFS serves it with the
  // content type captured at upload).
  const presigned = await storage.presignGet(inv.savedPath);
  if (presigned) return sendRedirect(event, presigned);

  const info = await storage.stat(inv.savedPath);
  if (!info)
    throw createError({ statusCode: 404, statusMessage: "File not found" });
  setHeader(event, "Content-Type", mimeFor(inv.filename || inv.savedPath));
  setHeader(event, "Content-Length", info.size);
  return sendStream(event, await storage.getStream(inv.savedPath));
});
