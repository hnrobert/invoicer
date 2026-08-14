import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import { requireCampaignAccess } from "#server/utils/campaign";

/** Return the raw extracted text / OCR result for an invoice (campaign access checked). */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, "invoiceId"));
  const inv = await AppDataSource.getRepository(Invoice).findOneBy({ id });
  if (!inv)
    throw createError({ statusCode: 404, statusMessage: "未找到该发票" });

  // Access control: the caller must own / be a member of the invoice's campaign.
  await requireCampaignAccess(event, inv.campaignId);
  return { ok: true, filename: inv.filename, text: inv.rawText ?? "" };
});
