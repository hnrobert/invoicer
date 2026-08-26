/**
 * One-time (per machine) fetch of the tesseract.js traineddata files into
 * ./tessdata — they are no longer committed to git (9.6MB of binaries).
 * Run via `pnpm fetch:tessdata`. Idempotent: existing files are kept.
 *
 * Sources are the same gzipped files tesseract.js downloads by default
 * (cdn.jsdelivr.net), fetched here at SETUP time so OCR at runtime stays
 * fully offline. Docker builds call this during the image build.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";

/**
 * TESSDATA_STRICT=1 → hard-fail on download errors (Docker/CI, where a
 * missing file must break the build). Default: warn and continue, so an
 * offline `pnpm install` still succeeds (OCR will error at runtime until
 * the files are present).
 */
const STRICT = process.env.TESSDATA_STRICT === "1";

const LANGS = (process.env.OCR_LANGS || "chi_sim,chi_tra,eng")
  .split(",")
  .map((l) => l.trim())
  .filter(Boolean);
const OUT_DIR = resolve(process.cwd(), "tessdata");
const CDN = "https://cdn.jsdelivr.net/npm/@tesseract.js-data";

await mkdir(OUT_DIR, { recursive: true });
for (const lang of LANGS) {
  const out = resolve(OUT_DIR, `${lang}.traineddata`);
  if (existsSync(out)) {
    console.log(`✓ ${lang}.traineddata already present — skipped`);
    continue;
  }
  // URL pattern = tesseract.js's own default (see its worker-script loadLanguage):
  // cdn.jsdelivr.net/npm/@tesseract.js-data/<lang>/4.0.0_best_int/<lang>.traineddata.gz
  const url = `${CDN}/${lang}/4.0.0_best_int/${lang}.traineddata.gz`;
  console.log(`↓ ${lang}.traineddata …`);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const gz = Buffer.from(await res.arrayBuffer());
    await writeFile(out, gunzipSync(gz));
    console.log(
      `✓ ${lang}.traineddata (${(gz.length / 1024 / 1024).toFixed(1)}MB gz)`,
    );
  } catch (e) {
    const msg = `✗ ${lang}: ${e instanceof Error ? e.message : e} (${url})`;
    if (STRICT) throw new Error(msg, { cause: e });
    console.warn(msg, "— continuing; run `pnpm fetch:tessdata` when online");
  }
}
console.log("tessdata ready at", OUT_DIR);
