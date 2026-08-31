import { getSessionUser } from "#server/utils/campaign";
import { consumeEmailCode, listEmails } from "#server/utils/emails";
import type { VerifyCodeBody } from "#shared/api";

/** Verify a linked email with the 6-digit code that was emailed to it. */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const { email, code } = await readBody<VerifyCodeBody>(event);
  const e = (email ?? "").trim().toLowerCase();
  const c = (code ?? "").trim();
  if (!e || !c) {
    throw createError({
      statusCode: 400,
      statusMessage: "Email and code required",
    });
  }
  const ok = await consumeEmailCode(user.id, e, c);
  if (!ok) {
    throw createError({
      statusCode: 400,
      statusMessage: "Code invalid or expired",
    });
  }
  return { ok: true, emails: await listEmails(user.id) };
});
