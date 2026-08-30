import {
  saveMailConfig,
  mailConfigToClient,
  type MailConfigInput,
} from "#server/utils/mail";
import { FieldMapSchema } from "email-poster";

const clampInt = (
  v: unknown,
  fallback: number,
  min = 1,
  max = 65535,
): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
};

const PROVIDERS = ["smtp", "post"] as const;
// email-poster preset names + the legacy powerautomate alias (migrates to
// custom_example at send time). '' is allowed — the stored postFieldMap is
// authoritative and the legacy fallback then defaults to smtogo.
const SCHEMAS = [
  "smtogo",
  "generic",
  "custom_example",
  "powerautomate",
] as const;

/** Persist the site mail configuration (superadmin action — caller-checked). */
export async function saveMailConfigFromClient(body: Record<string, unknown>) {
  const provider =
    typeof body?.provider === "string" &&
    (PROVIDERS as readonly string[]).includes(body.provider)
      ? body.provider
      : "smtp";

  // postFieldMap: email-poster FieldMap JSON (logical field → downstream key).
  // Validate non-empty values so a malformed map can never be persisted (the
  // body XOR rule — `body` vs `bodyHtml`/`bodyText` — is enforced here too).
  let postFieldMap = "";
  if (
    typeof body?.postFieldMap === "string" &&
    body.postFieldMap.trim() !== ""
  ) {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(body.postFieldMap);
    } catch {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid field map: not valid JSON",
      });
    }
    const fm = FieldMapSchema.safeParse(parsedJson);
    if (!fm.success) {
      throw createError({
        statusCode: 400,
        statusMessage:
          "Invalid field map: " +
          fm.error.issues
            .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("; "),
      });
    }
    // Store canonical form (only known logical keys, XOR already resolved).
    postFieldMap = JSON.stringify(fm.data);
  }

  const patch: MailConfigInput = {
    provider,
    smtpServer:
      typeof body?.smtpServer === "string" ? body.smtpServer.trim() : "",
    smtpPort: clampInt(body?.smtpPort, 465, 1, 65535),
    useSsl: Boolean(body?.useSsl),
    useTls: Boolean(body?.useTls),
    usePassword: Boolean(body?.usePassword),
    senderEmail:
      typeof body?.senderEmail === "string" ? body.senderEmail.trim() : "",
    senderEmailDisplay:
      typeof body?.senderEmailDisplay === "string"
        ? body.senderEmailDisplay.trim()
        : "",
    senderDomain:
      typeof body?.senderDomain === "string" ? body.senderDomain.trim() : "",
    maxLenRecipientEmail: clampInt(body?.maxLenRecipientEmail, 64, 1, 1024),
    maxLenSubject: clampInt(body?.maxLenSubject, 255, 1, 10000),
    maxLenBody: clampInt(body?.maxLenBody, 50000, 1, 1_000_000),
    postUrl: typeof body?.postUrl === "string" ? body.postUrl.trim() : "",
    postSchema:
      typeof body?.postSchema === "string" &&
      (SCHEMAS as readonly string[]).includes(body.postSchema)
        ? body.postSchema
        : "smtogo",
    postFieldMap,
  };
  // Secrets only updated when a non-empty string is supplied.
  if (typeof body?.senderPassword === "string" && body.senderPassword !== "") {
    patch.senderPassword = body.senderPassword;
  }
  if (typeof body?.postAuthToken === "string" && body.postAuthToken !== "") {
    patch.postAuthToken = body.postAuthToken;
  }

  // Validate required field per provider.
  if (provider === "smtp" && !patch.smtpServer) {
    throw createError({
      statusCode: 400,
      statusMessage: "SMTP server is required",
    });
  }
  if (provider === "post" && !patch.postUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: "POST webhook URL is required",
    });
  }

  const saved = await saveMailConfig(patch);
  return { ok: true as const, config: mailConfigToClient(saved) };
}

/**
 * Save the post-schemas library (the named field-map palette behind the
 * editor). The active webhook format stays in `postFieldMap` (saved with the
 * rest of the mail config); schemas persist here independently so the editor
 * can auto-sync them as the operator adds / renames / deletes. Stored
 * server-side — shared, not per-browser.
 */
export async function savePostSchemas(body: Record<string, unknown>) {
  const raw = Array.isArray(body?.schemas) ? body.schemas : [];

  // Validate each schema: id + name strings, fields a valid email-poster
  // FieldMap (known logical keys, body XOR). Store canonical JSON.
  const clean: { id: string; name: string; fields: Record<string, string> }[] =
    [];
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const id =
      typeof (t as { id?: unknown }).id === "string"
        ? (t as { id: string }).id
        : "";
    const name =
      typeof (t as { name?: unknown }).name === "string"
        ? (t as { name: string }).name
        : "";
    const fm = FieldMapSchema.safeParse(
      (t as { fields?: unknown }).fields ?? {},
    );
    if (!id || !fm.success) continue;
    clean.push({ id, name, fields: fm.data });
  }

  await saveMailConfig({ postSchemas: JSON.stringify(clean) });
  return { ok: true as const };
}
