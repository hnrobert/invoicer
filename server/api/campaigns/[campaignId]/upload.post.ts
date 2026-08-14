import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import { requireCampaignAccess } from "#server/utils/campaign";
import { processInvoice } from "#server/utils/process";
import { invoiceToPublic } from "#server/utils/serialize";

const IMAGE_EXTS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".bmp",
  ".gif",
  ".tif",
  ".tiff",
]);

/**
 * Upload one or more invoice files (PDF or image) to a campaign. Access is
 * verified first, then each file is saved, a pending record created, and
 * background processing kicked off per file. The frontend polls
 * GET /api/campaigns/:campaignId for live status.
 */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  await requireCampaignAccess(event, campaignId);

  const form = await readMultipartFormData(event);
  if (!form)
    throw createError({ statusCode: 400, statusMessage: "未收到上传内容" });

  const files = form.filter((f) => !!f.filename);
  if (files.length === 0)
    throw createError({ statusCode: 400, statusMessage: "未上传任何文件" });

  const uploadsDir = useRuntimeConfig().uploadsDir;
  await mkdir(uploadsDir, { recursive: true });

  const created: Invoice[] = [];
  for (const f of files) {
    const ext = extname(f.filename!).toLowerCase();
    const isPdf = ext === ".pdf";
    const isImg = IMAGE_EXTS.has(ext);
    if (!isPdf && !isImg) continue; // auto-filter: only PDF + images

    const pureName = basename(f.filename!.replace(/\\/g, "/"));
    const safeName = `${randomUUID().slice(0, 8)}_${pureName}`;
    const savedPath = join(uploadsDir, safeName);
    await writeFile(savedPath, f.data);

    const inv = await AppDataSource.getRepository(Invoice).save({
      campaignId,
      filename: pureName,
      savedPath,
      fileType: isPdf ? "pdf" : "image",
      status: "pending",
      reason: "等待识别",
      amountInTotal: false,
    });
    created.push(inv);

    // Fire-and-forget: process without blocking the upload response.
    void processInvoice(inv.id).catch((e) => console.error("[process]", e));
  }

  if (created.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "未检测到 PDF 或图片文件",
    });
  }
  return { ok: true, results: created.map(invoiceToPublic) };
});
