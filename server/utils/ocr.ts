import { createWorker } from 'tesseract.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Resolve the bundled tessdata dir (chi_sim / chi_tra / eng). In dev this points
// at <repo>/tessdata; in the docker image we set TESSDATA_DIR=/app/tessdata.
// OCR runs fully server-side against these local traineddata files — no API.
function langPath(): string {
  if (process.env.TESSDATA_DIR) return process.env.TESSDATA_DIR
  try {
    return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tessdata')
  } catch {
    return './tessdata'
  }
}

/**
 * OCR an image file (jpg/png/…) locally with tesseract.js. Used ONLY for image
 * inputs — PDFs go through text extraction (see extract.ts).
 */
export async function ocrImage(path: string): Promise<string> {
  const worker = await createWorker(['chi_sim', 'chi_tra', 'eng'], 1, {
    langPath: langPath(),
    // corePath is auto-resolved from the bundled tesseract.js-core (the Dockerfile
    // copies its .wasm next to the .js so this also works in the image).
  })
  try {
    const { data } = await worker.recognize(path)
    return data.text ?? ''
  } finally {
    await worker.terminate()
  }
}
