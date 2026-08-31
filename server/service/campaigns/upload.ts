import { randomUUID } from "node:crypto";
import { basename, extname } from "node:path";
import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import { processInvoice } from "#server/utils/process";
import { buildKey, mimeFor, storage } from "#server/utils/storage";
import { invoiceToPublic } from "#server/utils/serialize";
import type { UploadResponse } from "#shared/api";
import type { AuthUser } from "#shared/types";

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
 * Persist uploaded invoice files (PDF, image, or China digital-invoice XML/OFD)
 * and kick off background recognition per file. The caller has already
 * verified `rights.canUpload`. Returns the created pending records; processing
 * continues fire-and-forget (the frontend polls the campaign endpoint).
 */
export async function uploadInvoices(
  user: Pick<AuthUser, "id">,
  campaignId: number,
  files: { filename: string; data: Buffer }[],
): Promise<UploadResponse["results"]> {
  const created: Invoice[] = [];
  for (const f of files) {
    const ext = extname(f.filename).toLowerCase();
    const isPdf = ext === ".pdf";
    const isImg = IMAGE_EXTS.has(ext);
    const eInv = EINVOICE_EXTS.has(ext)
      ? (ext.slice(1) as "xml" | "ofd")
      : null;
    if (!isPdf && !isImg && !eInv) continue; // auto-filter: PDF / images / 数电票 files

    const pureName = basename(f.filename.replace(/\\/g, "/"));
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
  return created.map(invoiceToPublic);
}

/** True when at least one file is a supported type (for the 400 path). */
export function hasSupportedFile(files: { filename: string }[]): boolean {
  return files.some((f) => {
    const ext = extname(f.filename).toLowerCase();
    return ext === ".pdf" || IMAGE_EXTS.has(ext) || EINVOICE_EXTS.has(ext);
  });
}
