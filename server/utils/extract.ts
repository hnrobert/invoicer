import { extractText, getDocumentProxy } from "unpdf";

/**
 * Extract the embedded text layer from a PDF (Chinese e-invoices are text-based
 * PDFs, so this needs no OCR). Returns '' for image-only/scanned PDFs — the
 * caller leaves those for manual review (we deliberately do NOT OCR PDFs).
 */
export async function extractPdfText(data: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: true });
  return text ?? "";
}
