import { readFile } from "node:fs/promises";
import { createWorker } from "tesseract.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Jimp } from "jimp";

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
// CPU-only sidecar inference on large receipt photos takes well over 30 s
// (first request also warms the models); a short timeout here degenerates
// every batch into the tesseract fallback before Paddle answers.
const PADDLE_TIMEOUT_MS = 120_000;

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

// The sidecar is single-CPU: an upload burst firing every paddle request at
// once overloads it into timeouts, and ONE transport failure used to flip the
// whole app onto tesseract for 5 minutes — half a batch recognized on the
// weak engine. Serialize through a small pool instead.
let paddleActive = 0;
const paddleQueue: (() => void)[] = [];
async function withPaddleSlot<T>(fn: () => Promise<T>): Promise<T> {
  while (paddleActive >= 2) {
    await new Promise<void>((r) => paddleQueue.push(r));
  }
  paddleActive++;
  try {
    return await fn();
  } finally {
    paddleActive--;
    paddleQueue.shift()?.();
  }
}

/** PaddleX CPU inference CRASHES the whole sidecar process on very large
 *  photos (a 2296×4080 phone shot exits the server with code 0 — taking
 *  every concurrent request down with it); downscaled to ≤1600px the same
 *  images OCR fine. Sniff the dimensions from the JPEG/PNG headers and only
 *  re-encode when the long edge exceeds the limit — most files pass through
 *  untouched. */
const PADDLE_MAX_EDGE = 1600;
function imageDimensions(buf: Buffer): { w: number; h: number } | null {
  // PNG: IHDR at fixed offset
  if (buf.length > 24 && buf.readUInt32BE(12) === 0x49484452) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  // JPEG: walk the segment markers to a SOF frame header
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) break;
      const marker = buf[i + 1]!;
      const size = buf.readUInt16BE(i + 2);
      const isSof =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isSof)
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + size;
    }
  }
  return null;
}
async function paddleNormalize(buf: Buffer): Promise<Buffer> {
  const dim = imageDimensions(buf);
  if (!dim) return buf;
  const longEdge = Math.max(dim.w, dim.h);
  if (longEdge <= PADDLE_MAX_EDGE) return buf;
  const img = await Jimp.read(buf);
  // fit inside the box preserving aspect — only the long edge hits the limit
  img.scaleToFit({ w: PADDLE_MAX_EDGE, h: PADDLE_MAX_EDGE });
  return img.getBuffer("image/jpeg", { quality: 85 });
}

async function paddleOcrOnce(
  buf: Buffer,
  ignoreBackoff = false,
): Promise<string | null> {
  const base = process.env.PADDLEOCR_URL;
  if (!base) return null;
  if (!ignoreBackoff && Date.now() < paddleDownUntil) return null;
  const url = /\/(ocr|predict)$/i.test(base)
    ? base
    : `${base.replace(/\/$/, "")}/ocr`;
  try {
    const payload = await paddleNormalize(buf);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file: payload.toString("base64"),
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

/** One retry before the back-off holds — a burst overload hiccup should
 *  not degrade the rest of the batch to tesseract. */
async function paddleOcr(buf: Buffer): Promise<string | null> {
  return withPaddleSlot(async () => {
    const first = await paddleOcrOnce(buf);
    if (first != null) return first;
    return paddleOcrOnce(buf, true);
  });
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
