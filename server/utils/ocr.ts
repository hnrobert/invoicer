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
    if (Array.isArray(rec[key]) && rec[key].every((v) => typeof v === "string")) {
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
  const url = /\/(ocr|predict)$/i.test(base) ? base : `${base.replace(/\/$/, "")}/ocr`;
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

/** OCR an image buffer with tesseract.js (local traineddata, no API). */
async function tesseractOcr(buf: Buffer): Promise<string> {
  const worker = await createWorker(["chi_sim", "chi_tra", "eng"], 1, {
    langPath: langPath(),
    // corePath is auto-resolved from the bundled tesseract.js-core (the Dockerfile
    // copies its .wasm next to the .js so this also works in the image).
  });
  try {
    const { data } = await worker.recognize(buf);
    return data.text ?? "";
  } finally {
    await worker.terminate();
  }
}

/**
 * OCR an image file: PaddleOCR sidecar when configured, tesseract.js
 * otherwise (and as the automatic fallback).
 */
export async function ocrImage(path: string): Promise<string> {
  const buf = await readFile(path);
  const paddle = await paddleOcr(buf);
  if (paddle != null) return paddle;
  return tesseractOcr(buf);
}
