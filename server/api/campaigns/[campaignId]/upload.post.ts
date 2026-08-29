import { randomUUID } from "node:crypto";
import { basename, extname } from "node:path";
import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import { requireCampaignAccess } from "#server/utils/campaign";
import { processInvoice } from "#server/utils/process";
import { invoiceToPublic } from "#server/utils/serialize";
import { buildKey, mimeFor, storage } from "#server/utils/storage";

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
/** China digital-invoice structured files (数电票) — parsed directly, no OCR. */
const EINVOICE_EXTS = new Set([".xml", ".ofd"]);

/**
 * Upload one or more invoice files (PDF, image, or China digital-invoice XML/OFD) to a campaign. Access is
 * verified first, then each file is saved, a pending record created, and
 * background processing kicked off per file. The frontend polls
 * GET /api/campaigns/:campaignId for live status. Each invoice is attributed
 * to the uploading user; non-privileged users only ever see their own.
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

  const files = form.filter((f) => !!f.filename);
  if (files.length === 0)
    throw createError({ statusCode: 400, statusMessage: "No files uploaded" });

  const created: Invoice[] = [];
  for (const f of files) {
    const ext = extname(f.filename!).toLowerCase();
    const isPdf = ext === ".pdf";
    const isImg = IMAGE_EXTS.has(ext);
    const eInv = EINVOICE_EXTS.has(ext)
      ? (ext.slice(1) as "xml" | "ofd")
      : null;
    if (!isPdf && !isImg && !eInv) continue; // auto-filter: PDF / images / 数电票 files

    const pureName = basename(f.filename!.replace(/\\/g, "/"));
    const safeName = `${randomUUID().slice(0, 8)}_${pureName}`;
    // Storage key (fs backend resolves it under uploadsDir; S3 uses it as-is).
    const savedPath = buildKey(campaignId, safeName);
    await storage.putObject(savedPath, f.data, mimeFor(safeName));

    const inv = await AppDataSource.getRepository(Invoice).save({
      campaignId,
      uploaderId: user.id,
      filename: pureName,
      savedPath,
      fileType: eInv ?? (isPdf ? "pdf" : "image"),
      status: "pending",
      reason: "Waiting for recognition",
      amountInTotal: false,
    });
    created.push(inv);

    // Fire-and-forget: process without blocking the upload response.
    void processInvoice(inv.id).catch((e) => console.error("[process]", e));
  }

  if (created.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "No PDF, image, or digital-invoice (XML/OFD) files detected",
    });
  }
  return { ok: true, results: created.map(invoiceToPublic) };
});
