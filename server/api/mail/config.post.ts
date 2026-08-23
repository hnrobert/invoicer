import {
  saveMailConfig,
  mailConfigToClient,
  type MailConfigInput,
} from "#server/utils/mail";
import { FieldMapSchema } from "email-poster";
import { requireSuperAdmin } from "#server/utils/superadmin";

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
const SCHEMAS = ["smtogo", "powerautomate"] as const;

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event);
  const body = await readBody<Record<string, unknown>>(event);

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
  return { ok: true, config: mailConfigToClient(saved) };
});
