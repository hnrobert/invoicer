import { readFile } from "node:fs/promises";
import { AppDataSource } from "./database";
import { Invoice } from "#server/entities/invoice.entity";
import { Campaign } from "#server/entities/campaign.entity";
import { extractPdfText } from "./extract";
import { ocrImage } from "./ocr";
import { extractInvoiceFields } from "./fields";
import { matchInvoice } from "./match";
import { parseElectronicInvoice } from "./einvoice";

/**
 * Process one invoice end-to-end: extract fields — 数电票 XML/OFD are parsed
 * structurally (no OCR), PDFs via the text layer, images via OCR (PaddleOCR
 * sidecar when configured, tesseract.js otherwise) — then match against the
 * campaign's expected values and persist the outcome. Status goes
 * pending → processing → final.
 *
 * PDFs are NOT OCR'd: a PDF with no text layer is left for manual review rather
 * than silently falling back to OCR (only image inputs use OCR, per the spec).
 */
export async function processInvoice(invoiceId: number): Promise<void> {
  const repo = AppDataSource.getRepository(Invoice);
  const inv = await repo.findOneBy({ id: invoiceId });
  if (!inv) return;

  await repo.update(
    { id: invoiceId },
    { status: "processing", reason: "Recognizing…" },
  );

  const campaign = await AppDataSource.getRepository(Campaign).findOneBy({
    id: inv.campaignId,
  });

  try {
    let text: string;
    let directFields: ReturnType<typeof extractInvoiceFields> | null = null;
    if (inv.fileType === "xml" || inv.fileType === "ofd") {
      const parsed = parseElectronicInvoice(
        await readFile(inv.savedPath),
        inv.fileType,
      );
      if (!parsed) {
        await repo.update(
          { id: invoiceId },
          {
            status: "review",
            reason:
              "Digital-invoice file recognized, but no invoice fields found — review manually",
            processedAt: new Date(),
          },
        );
        return;
      }
      directFields = parsed.fields;
      text = parsed.rawText;
    } else if (inv.fileType === "pdf") {
      const buf = await readFile(inv.savedPath);
      text = await extractPdfText(new Uint8Array(buf));
      if (!text.trim()) {
        await repo.update(
          { id: invoiceId },
          {
            status: "review",
            reason:
              "No text extracted from the PDF (likely a scan — upload as an image or review manually)",
            processedAt: new Date(),
          },
        );
        return;
      }
    } else {
      text = await ocrImage(inv.savedPath);
    }

    const fields = directFields ?? extractInvoiceFields(text);
    const m = matchInvoice(
      fields,
      campaign?.expectedTitle ?? "",
      campaign?.expectedTaxId ?? null,
    );

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
    );
  } catch (e) {
    await repo.update(
      { id: invoiceId },
      {
        status: "error",
        reason: "Recognition error",
        error: e instanceof Error ? e.message : String(e),
        processedAt: new Date(),
      },
    );
    console.error(`[process] invoice ${invoiceId} failed:`, e);
  }
}
