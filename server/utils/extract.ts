/**
 * Extract the embedded text layer from a PDF (Chinese e-invoices are
 * text-based PDFs, so this needs no OCR). Returns '' for image-only/scanned
 * PDFs — the caller leaves those for manual review (we deliberately do NOT
 * OCR PDFs).
 *
 * Uses pdfjs-dist directly (its legacy build runs in Node without DOM
 * shims); unpdf's lazy resolver proved unreliable under Nitro bundling.
 */
export async function extractPdfText(data: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  try {
    let out = "";
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if ("str" in item) out += item.str + (item.hasEOL ? "\n" : "");
      }
      page.cleanup();
    }
    return out;
  } finally {
    // v6: destroy lives on the loading task, not the document proxy.
    await (task as unknown as { destroy: () => Promise<void> }).destroy();
  }
}
