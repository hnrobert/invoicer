import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import { requireCampaignAccess } from "#server/utils/campaign";

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};

/** Stream the original uploaded file for inline preview (campaign access checked). */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, "invoiceId"));
  const inv = await AppDataSource.getRepository(Invoice).findOneBy({ id });
  if (!inv)
    throw createError({ statusCode: 404, statusMessage: "未找到该发票" });

  // Access control: the caller must own / be a member of the invoice's campaign.
  await requireCampaignAccess(event, inv.campaignId);

  try {
    const s = await stat(inv.savedPath);
    setHeader(
      event,
      "Content-Type",
      MIME[extname(inv.savedPath).toLowerCase()] ?? "application/octet-stream",
    );
    setHeader(event, "Content-Length", s.size);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "文件不存在" });
  }

  return sendStream(event, createReadStream(inv.savedPath));
});
