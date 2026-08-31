import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import { mimeFor, storage } from "#server/utils/storage";
import type { InvoiceTextResponse } from "#shared/api";
import type { AuthUser, CampaignRights } from "#shared/types";
import type { Readable } from "node:stream";

/** The invoice's campaign id (for campaign-level access checks) — 404 if gone. */
export async function invoiceCampaignId(invoiceId: number): Promise<number> {
  const inv = await AppDataSource.getRepository(Invoice).findOneBy({
    id: invoiceId,
  });
  if (!inv)
    throw createError({ statusCode: 404, statusMessage: "Invoice not found" });
  return inv.campaignId;
}

/** Load an invoice + enforce per-invoice isolation (uploader or view-all). */
export async function loadAccessibleInvoice(
  user: Pick<AuthUser, "id">,
  rights: CampaignRights,
  invoiceId: number,
): Promise<Invoice> {
  const inv = await AppDataSource.getRepository(Invoice).findOneBy({
    id: invoiceId,
  });
  if (!inv)
    throw createError({ statusCode: 404, statusMessage: "Invoice not found" });
  if (!rights.canViewAll && inv.uploaderId !== user.id) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }
  return inv;
}

/** The raw extracted text / OCR result for an invoice. */
export async function invoiceRawText(
  user: Pick<AuthUser, "id">,
  rights: CampaignRights,
  invoiceId: number,
): Promise<InvoiceTextResponse> {
  const inv = await loadAccessibleInvoice(user, rights, invoiceId);
  return { ok: true, filename: inv.filename, text: inv.rawText ?? "" };
}

/**
 * Resolve the original file for inline preview. Returns either a presigned
 * URL (S3-mode objects — the API layer 302s to it so bytes bypass the node
 * process) or stream metadata for proxying.
 */
export async function invoiceFileStream(
  user: Pick<AuthUser, "id">,
  rights: CampaignRights,
  invoiceId: number,
): Promise<
  | { kind: "redirect"; url: string }
  | {
      kind: "stream";
      mime: string;
      size: number;
      open: () => Promise<Readable>;
    }
> {
  const inv = await loadAccessibleInvoice(user, rights, invoiceId);
  const presigned = await storage.presignGet(inv.savedPath);
  if (presigned) return { kind: "redirect", url: presigned };

  const info = await storage.stat(inv.savedPath);
  if (!info)
    throw createError({ statusCode: 404, statusMessage: "File not found" });
  return {
    kind: "stream",
    mime: mimeFor(inv.filename || inv.savedPath),
    size: info.size,
    open: () => storage.getStream(inv.savedPath),
  };
}
