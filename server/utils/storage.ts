import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { dirname, extname, isAbsolute, join } from "node:path";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

/**
 * Object storage for uploaded invoice/order files, with two interchangeable
 * backends selected by configuration:
 *
 * - **S3** (SeaweedFS, also works with MinIO/AWS/etc.) — active when
 *   `S3_BUCKET` is set in the environment. Enables presigned GET URLs so file
 *   downloads bypass the node process entirely.
 * - **Filesystem** — the original `uploadsDir` behavior, used otherwise (dev,
 *   CI, S3-less deployments).
 *
 * Keys are relative object keys like `invoices/3/ab12_name.pdf` (per-campaign
 * prefixes keep bulk operations cheap). Rows written before the S3 layer
 * existed store raw filesystem paths (absolute or `uploads/…` relative);
 * {@link resolveFs} detects those and serves them straight from disk in both
 * modes, so old data keeps working without a migration.
 */

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".xml": "application/xml",
  ".ofd": "application/octet-stream",
};

export function mimeFor(name: string): string {
  return MIME[extname(name).toLowerCase()] ?? "application/octet-stream";
}

/** Pre-S3 rows store raw fs paths; anything else is a managed key. */
export function isLegacyPath(ref: string): boolean {
  return isAbsolute(ref) || !ref.startsWith("invoices/");
}

export function buildKey(campaignId: number, safeName: string): string {
  return `invoices/${campaignId}/${safeName}`;
}

/**
 * Storage settings come straight from the environment (same names the compose
 * file documents) rather than Nuxt's runtimeConfig, so this module also works
 * outside the Nitro runtime.
 */
const cfg = {
  uploadsDir: process.env.UPLOADS_DIR || "./uploads",
  s3Endpoint: process.env.S3_ENDPOINT || "",
  s3Region: process.env.S3_REGION || "us-east-1",
  s3Bucket: process.env.S3_BUCKET || "",
  s3AccessKey: process.env.S3_ACCESS_KEY || "",
  s3SecretKey: process.env.S3_SECRET_KEY || "",
};

function resolveFs(ref: string): string {
  if (isLegacyPath(ref)) return ref;
  return join(cfg.uploadsDir, ref);
}

// ---------- S3 client (lazy singleton) ----------

let s3: S3Client | null = null;

function s3Client(): S3Client {
  if (!s3) {
    s3 = new S3Client({
      endpoint: cfg.s3Endpoint || undefined,
      region: cfg.s3Region || "us-east-1",
      forcePathStyle: true, // SeaweedFS serves path-style buckets
      credentials: {
        accessKeyId: cfg.s3AccessKey || "",
        secretAccessKey: cfg.s3SecretKey || "",
      },
    });
  }
  return s3;
}

function s3Mode(): boolean {
  return !!cfg.s3Bucket;
}

function bucket(): string {
  return cfg.s3Bucket;
}

// ---------- public API ----------

export const storage = {
  /** True when objects live in S3 (presigned URLs available). */
  get isS3(): boolean {
    return s3Mode();
  },

  /** Store bytes under `key`. `contentType` is persisted with the object. */
  async putObject(
    key: string,
    data: Buffer | Uint8Array,
    contentType?: string,
  ): Promise<void> {
    if (s3Mode()) {
      await s3Client().send(
        new PutObjectCommand({
          Bucket: bucket(),
          Key: key,
          Body: data,
          ContentType: contentType,
        }),
      );
    } else {
      const p = resolveFs(key);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, data);
    }
  },

  /** Whole-file buffer (processing, export packing). */
  async getBuffer(ref: string): Promise<Buffer> {
    if (s3Mode() && !isLegacyPath(ref)) {
      const res = await s3Client().send(
        new GetObjectCommand({
          Bucket: bucket(),
          Key: ref,
        }),
      );
      const bytes = await res.Body!.transformToByteArray();
      return Buffer.from(bytes);
    }
    return readFile(resolveFs(ref));
  },

  /** Node Readable stream (inline preview without buffering). */
  async getStream(ref: string): Promise<Readable> {
    if (s3Mode() && !isLegacyPath(ref)) {
      const res = await s3Client().send(
        new GetObjectCommand({
          Bucket: bucket(),
          Key: ref,
        }),
      );
      return Readable.fromWeb(res.Body as unknown as WebReadableStream);
    }
    return createReadStream(resolveFs(ref));
  },

  /** Object size in bytes, or null when missing (fs preview stat). */
  async stat(ref: string): Promise<{ size: number } | null> {
    if (s3Mode() && !isLegacyPath(ref)) {
      try {
        const res = await s3Client().send(
          new GetObjectCommand({
            Bucket: bucket(),
            Key: ref,
          }),
        );
        return { size: res.ContentLength ?? 0 };
      } catch {
        return null;
      }
    }
    try {
      const { stat } = await import("node:fs/promises");
      const s = await stat(resolveFs(ref));
      return { size: s.size };
    } catch {
      return null;
    }
  },

  /** Delete one object; missing objects are tolerated. */
  async remove(ref: string): Promise<void> {
    try {
      if (s3Mode() && !isLegacyPath(ref)) {
        await s3Client().send(
          new DeleteObjectCommand({
            Bucket: bucket(),
            Key: ref,
          }),
        );
      } else {
        await unlink(resolveFs(ref));
      }
    } catch {
      // deletion is best-effort (clear flows already ignore failures)
    }
  },

  /**
   * Short-lived presigned GET URL, or null when not applicable (fs mode or a
   * legacy local path). Callers fall back to proxy streaming.
   */
  async presignGet(ref: string, ttlSeconds = 300): Promise<string | null> {
    if (!s3Mode() || isLegacyPath(ref)) return null;
    return getSignedUrl(
      s3Client(),
      new GetObjectCommand({ Bucket: bucket(), Key: ref }),
      { expiresIn: ttlSeconds },
    );
  },
};
