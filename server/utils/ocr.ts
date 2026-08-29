import { readFile } from "node:fs/promises";
import { createWorker } from "tesseract.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Resolve the bundled tessdata dir (chi_sim / chi_tra / eng). In dev this points
// at <repo>/tessdata; in the docker image we set TESSDATA_DIR=/app/tessdata.
// OCR runs fully server-side against these local traineddata files — no API.
function langPath(): string {
  if (process.env.TESSDATA_DIR) return process.env.TESSDATA_DIR;
  try {
    return resolve(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "tessdata",
    );
  } catch {
    return "./tessdata";
  }
}

/**
 * PaddleOCR sidecar (optional). When PADDLEOCR_URL is set (e.g. the PaddleX
 * serving container in docker-compose, profile "ocr"), images are OCR'd by
 * PP-OCR (much stronger on Chinese invoices) instead of tesseract.js. The
 * request follows the PaddleX serving contract — POST {file: <base64>,
 * fileType: 1} — and the response digger tolerates the minor shape
 * differences between PaddleX versions (rec_texts / texts / results[].text).
 * Any failure falls back to the local tesseract path, so the app works
 * unchanged without the sidecar.
 */
const PADDLE_TIMEOUT_MS = 30_000;

/**
 * When the configured sidecar is unreachable (not started, DNS miss inside
 * the compose network), back off for 5 minutes instead of retrying on every
 * image — the tesseract fallback serves in the meantime.
 */
let paddleDownUntil = 0;

function deepFindTextArray(node: unknown, depth = 0): string[] | null {
  if (depth > 8 || node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    if (node.length && node.every((v) => typeof v === "string")) return node;
    for (const item of node) {
      const hit = deepFindTextArray(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  // Prefer the canonical PaddleX keys first, then dig.
  const rec = node as Record<string, unknown>;
  for (const key of ["rec_texts", "recText", "texts"]) {
    if (
      Array.isArray(rec[key]) &&
      rec[key].every((v) => typeof v === "string")
    ) {
      return rec[key] as string[];
    }
  }
  for (const value of Object.values(rec)) {
    const hit = deepFindTextArray(value, depth + 1);
    if (hit) return hit;
  }
  return null;
}

async function paddleOcr(buf: Buffer): Promise<string | null> {
  const base = process.env.PADDLEOCR_URL;
  if (!base) return null;
  if (Date.now() < paddleDownUntil) return null;
  const url = /\/(ocr|predict)$/i.test(base)
    ? base
    : `${base.replace(/\/$/, "")}/ocr`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file: buf.toString("base64"),
        fileType: 1, // 1 = image (PaddleX serving contract)
      }),
      signal: AbortSignal.timeout(PADDLE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`sidecar HTTP ${res.status}`);
    const data = (await res.json()) as unknown;
    const texts = deepFindTextArray(data);
    if (!texts?.length) throw new Error("sidecar returned no text");
    return texts.join("\n");
  } catch (e) {
    // Transport-level failure → sidecar down; back off 5 minutes.
    paddleDownUntil = Date.now() + 5 * 60_000;
    console.warn(
      `[ocr] PaddleOCR sidecar unreachable (${e instanceof Error ? e.message : e}); using tesseract.js for 5 min`,
    );
    return null;
  }
}

/**
 * Recognition languages. Simplified Chinese + ASCII (digits, ¥, latin) covers
 * mainland invoices/receipts; traditional (chi_tra) is omitted because each
 * extra language roughly DOUBLES recognition time, and hard cases are better
 * served by the PaddleOCR sidecar. Override with OCR_LANGS="chi_sim,chi_tra,eng".
 */
const LANGS = (process.env.OCR_LANGS || "chi_sim,eng")
  .split(",")
  .map((l) => l.trim())
  .filter(Boolean);

/**
 * Shared, lazily-created worker. Creating a worker re-reads ~10MB of
 * traineddata + re-initializes wasm — measurable per image, and much worse on
 * cold page cache / containers — so ONE worker serves all requests.
 * Recognition is serialized through a promise chain (a tesseract worker
 * processes one image at a time); on failure the worker is discarded and the
 * next call recreates it.
 */
type TesseractWorker = Awaited<ReturnType<typeof createWorker>>;
let sharedWorker: Promise<TesseractWorker> | null = null;
let queue: Promise<unknown> = Promise.resolve();

function getWorker() {
  if (!sharedWorker) {
    sharedWorker = createWorker(LANGS, 1, {
      langPath: langPath(),
      // Bundled traineddata files are uncompressed — without this tesseract.js
      // looks for .traineddata.gz and image OCR hangs forever.
      gzip: false,
      // tesseract.js otherwise copies each loaded language into cachePath
      // (default: cwd) — that's what littered <lang>.traineddata files into
      // the repo root. We read straight from the bundled dir, no cache.
      cacheMethod: "none",
      // corePath is auto-resolved from the bundled tesseract.js-core (the Dockerfile
      // copies its .wasm next to the .js so this also works in the image).
    }).catch((e) => {
      sharedWorker = null; // failed init — retry on next call
      throw e;
    });
  }
  return sharedWorker;
}

/** OCR an image buffer with tesseract.js (local traineddata, no API). */
async function tesseractOcr(buf: Buffer): Promise<string> {
  const run = queue.then(async () => {
    const worker = await getWorker();
    try {
      const { data } = await worker.recognize(buf);
      return data.text ?? "";
    } catch (e) {
      // The worker may be broken (OOM, wasm crash) — drop it so the next
      // call starts fresh instead of failing forever.
      sharedWorker = null;
      try {
        await worker!.terminate();
      } catch {
        // already dead
      }
      throw e;
    }
  });
  queue = run.catch(() => {}); // keep the chain alive after failures
  return run;
}

/**
 * OCR an image: PaddleOCR sidecar when configured, tesseract.js otherwise
 * (and as the automatic fallback). Accepts a path (read from disk) or an
 * already-loaded Buffer (object-storage flows).
 */
export async function ocrImage(src: string | Buffer): Promise<string> {
  const buf = typeof src === "string" ? await readFile(src) : src;
  const paddle = await paddleOcr(buf);
  if (paddle != null) return paddle;
  return tesseractOcr(buf);
}
