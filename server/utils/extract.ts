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
import { pathToFileURL } from "node:url";

export async function extractPdfText(data: Uint8Array): Promise<string> {
  // Node ships no global DOMMatrix, but pdf.js needs it for transformed
  // content (certain CID fonts) — the `dommatrix` polyfill covers the
  // bundled-production case where "DOMMatrix is not defined" killed whole
  // PDFs. No-op in runtimes that already provide it.
  if (typeof globalThis.DOMMatrix === "undefined") {
    const { default: DOMMatrix } = await import("dommatrix");
    (globalThis as { DOMMatrix?: unknown }).DOMMatrix = DOMMatrix;
  }
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
  // In the bundled production build pdf.js resolves its fake worker by
  // module path, which no longer exists under .output — point it at the
  // real worker file inside node_modules. file:// URL form: the fake worker
  // loader dynamic-imports this value, and import() rejects bare FS paths.
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
      join(pkgRoot, "legacy/build/pdf.worker.mjs"),
    ).href;
  }
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
      // Rebuild in VISUAL order, not content-stream order: e-invoice PDFs
      // often store label runs and value runs as separate later objects, so
      // stream order yields labels-with-holes and a value dump at the end.
      // pdfjs hands each run its transform (e=x, f=y baseline) — group runs
      // into lines by baseline (y descends), order within a line by x.
      const pieces: {
        str: string;
        x: number;
        y: number;
        w: number;
        h: number;
      }[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str) continue;
        const t = item.transform ?? [1, 0, 0, 1, 0, 0];
        pieces.push({
          str: item.str,
          x: t[4],
          y: t[5],
          w: item.width ?? 0,
          h: item.height ?? (Math.abs(t[3]) || 10),
        });
      }
      pieces.sort((a, b) => b.y - a.y || a.x - b.x);
      const lines: (typeof pieces)[] = [];
      let cur: typeof pieces = [];
      let baseY = NaN;
      for (const pc of pieces) {
        if (cur.length && Math.abs(pc.y - baseY) > Math.max(2, pc.h * 0.4)) {
          lines.push(cur);
          cur = [];
        }
        if (!cur.length) baseY = pc.y;
        cur.push(pc);
      }
      if (cur.length) lines.push(cur);
      for (const ln of lines) {
        ln.sort((a, b) => a.x - b.x);
        let text = "";
        let prevEnd: number | null = null;
        for (const pc of ln) {
          if (prevEnd != null && pc.x - prevEnd > 1) text += " ";
          text += pc.str;
          prevEnd = pc.x + pc.w;
        }
        out += text + "\n";
      }
      page.cleanup();
    }
    return out;
  } finally {
    // v6: destroy lives on the loading task, not the document proxy.
    await (task as unknown as { destroy: () => Promise<void> }).destroy();
  }
}
