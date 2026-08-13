import { readFile } from 'node:fs/promises'
import { AppDataSource } from './database'
import { Invoice } from '#server/entities/invoice.entity'
import { ReviewSession } from '#server/entities/reviewSession.entity'
import { extractPdfText } from './extract'
import { ocrImage } from './ocr'
import { extractInvoiceFields } from './fields'
import { matchInvoice } from './match'

/**
 * Process one invoice end-to-end: extract text (PDF text layer, or OCR for
 * images), pull out title/tax id/amount, match against the session's expected
 * values, and persist the outcome. Updates status pending → processing → final.
 *
 * PDFs are NOT OCR'd: a PDF with no text layer is left for manual review rather
 * than silently falling back to OCR (only image inputs use OCR, per the spec).
 */
export async function processInvoice(invoiceId: number): Promise<void> {
  const repo = AppDataSource.getRepository(Invoice)
  const inv = await repo.findOneBy({ id: invoiceId })
  if (!inv) return

  await repo.update({ id: invoiceId }, { status: 'processing', reason: '正在识别…' })

  const session = await AppDataSource.getRepository(ReviewSession).findOneBy({
    id: inv.sessionId,
  })

  try {
    let text: string
    if (inv.fileType === 'pdf') {
      const buf = await readFile(inv.savedPath)
      text = await extractPdfText(new Uint8Array(buf))
      if (!text.trim()) {
        await repo.update(
          { id: invoiceId },
          {
            status: 'review',
            reason: 'PDF 未提取到文本（可能为扫描件，请以图片上传或手动审核）',
            processedAt: new Date(),
          },
        )
        return
      }
    } else {
      text = await ocrImage(inv.savedPath)
    }

    const fields = extractInvoiceFields(text)
    const m = matchInvoice(fields, session?.expectedTitle ?? '', session?.expectedTaxId ?? null)

    await repo.update(
      { id: invoiceId },
      {
        status: m.status,
        reason: m.reason,
        amountInTotal: m.amountInTotal,
        extractedTitle: fields.title,
        extractedTaxId: fields.taxId,
        extractedAmount: fields.amount,
        rawText: text.slice(0, 20000),
        processedAt: new Date(),
      },
    )
  } catch (e) {
    await repo.update(
      { id: invoiceId },
      {
        status: 'error',
        reason: '识别异常',
        error: e instanceof Error ? e.message : String(e),
        processedAt: new Date(),
      },
    )
    console.error(`[process] invoice ${invoiceId} failed:`, e)
  }
}
