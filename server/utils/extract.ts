/**
 * Extract the embedded text layer from a PDF (Chinese e-invoices are
 * text-based PDFs, so this needs no OCR). Returns '' for image-only/scanned
 * PDFs — the caller leaves those for manual review (we deliberately do NOT
 * OCR PDFs).
 *
 * Uses pdfjs-dist directly (its legacy build runs in Node without DOM
 * shims); unpdf's lazy resolver proved unreliable under Nitro bundling.
 */
import { createRequire } from "node:module";
import { join, resolve, dirname } from "node:path";

export async function extractPdfText(data: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // CID-keyed CJK fonts decode through the CMap tables shipped in the
  // package. Without cMapUrl pdf.js logs a translateFont warning and
  // silently DROPS every text run set in those fonts — whole value streams
  // (amounts, names, tax ids) vanish from the output. Resolve the package
  // root at runtime so this works in dev and in the deployed node_modules.
  const require = createRequire(import.meta.url);
  const pkgRoot = resolve(
    dirname(require.resolve("pdfjs-dist/legacy/build/pdf.mjs")),
    "../..",
  );
  // Plain filesystem paths (NOT file:// URLs) — in Node the legacy build
  // reads cmap/font data through fs.readFile, and Node fetch rejects
  // file:// URLs anyway.
  const task = pdfjs.getDocument({
    data,
    cMapUrl: join(pkgRoot, "cmaps") + "/",
    cMapPacked: true,
    standardFontDataUrl: join(pkgRoot, "standard_fonts") + "/",
  });
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
