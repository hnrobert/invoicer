import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import { requireCampaignAccess } from "#server/utils/campaign";

/** Return the raw extracted text / OCR result for an invoice (campaign + invoice access checked). */
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
  return { ok: true, filename: inv.filename, text: inv.rawText ?? "" };
});
