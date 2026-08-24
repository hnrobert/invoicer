import { AppDataSource } from "./database";
import { Invoice } from "#server/entities/invoice.entity";
import type { InvoicePublic } from "#shared/types";

/** Strip internal/server-only fields before returning an invoice to the client. */
export function invoiceToPublic(r: Invoice): InvoicePublic {
  return {
    id: r.id,
    campaignId: r.campaignId,
    uploaderId: r.uploaderId,
    groupId: r.groupId,
    filename: r.filename,
    fileType: r.fileType,
    status: r.status,
    reviewState: r.reviewState,
    reason: r.reason,
    extractedTitle: r.extractedTitle,
    extractedTaxId: r.extractedTaxId,
    extractedAmount: r.extractedAmount,
    manualAmount: r.manualAmount,
    amountInTotal: r.amountInTotal,
    error: r.error,
  };
}

/** Sum compliant amounts over an explicit invoice row set (scoped views). */
export function sumRows(rows: Invoice[]): number {
  let total = 0;
  for (const r of rows) {
    const amt = r.extractedAmount ?? r.manualAmount;
    if (amt != null) total += amt;
  }
  return Math.round(total * 100) / 100;
}

/**
 * Sum the compliant amounts in a campaign. Uses the recognized amount, falling
 * back to the operator-entered manual amount. Pass `uploaderId` to scope the
 * sum to one uploader's invoices.
 *
 * Two review flows decide what counts:
 *  - `direct` (legacy / personal campaigns): every invoice flagged
 *    `amountInTotal` — the reviewer's qualified decision counts immediately.
 *  - `submit` (platform-model org campaigns): only `reviewState = 'approved'`
 *    invoices — uploaders submit drafts, reviewers approve, the total counts
 *    approvals alone.
 */
export async function calcTotal(
  campaignId: number,
  opts?: { uploaderId?: string; flow?: "direct" | "submit" },
): Promise<number> {
  const flow = opts?.flow ?? "direct";
  const where: Record<string, unknown> = { campaignId };
  if (opts?.uploaderId) where.uploaderId = opts.uploaderId;
  if (flow === "submit") where.reviewState = "approved";
  else where.amountInTotal = true;

  const rows = await AppDataSource.getRepository(Invoice).find({ where });
  let total = 0;
  for (const r of rows) {
    const amt = r.extractedAmount ?? r.manualAmount;
    if (amt != null) total += amt;
  }
  return Math.round(total * 100) / 100;
}
