import { AppDataSource } from './database'
import { Invoice } from '#server/entities/invoice.entity'
import type { InvoicePublic } from '#shared/types'

/** Strip internal/server-only fields before returning an invoice to the client. */
export function invoiceToPublic(r: Invoice): InvoicePublic {
  return {
    id: r.id,
    sessionId: r.sessionId,
    filename: r.filename,
    fileType: r.fileType,
    status: r.status,
    reason: r.reason,
    extractedTitle: r.extractedTitle,
    extractedTaxId: r.extractedTaxId,
    extractedAmount: r.extractedAmount,
    manualAmount: r.manualAmount,
    amountInTotal: r.amountInTotal,
    error: r.error,
  }
}

/**
 * Sum the amounts of every invoice flagged `amountInTotal` in a session.
 * Uses the recognized amount, falling back to the operator-entered manual amount.
 */
export async function calcTotal(sessionId: number): Promise<number> {
  const rows = await AppDataSource.getRepository(Invoice).find({
    where: { sessionId, amountInTotal: true },
  })
  let total = 0
  for (const r of rows) {
    const amt = r.extractedAmount ?? r.manualAmount
    if (amt != null) total += amt
  }
  return Math.round(total * 100) / 100
}
