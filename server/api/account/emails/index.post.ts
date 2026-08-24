import { getSessionUser } from "#server/utils/campaign";
import { addEmail, listEmails } from "#server/utils/emails";
import { sendVerificationEmail } from "#server/utils/emailVerificationMail";
import {
  checkAccountSend,
  checkEmailSend,
  emailLimitError,
} from "#server/utils/emailLimit";

/**
 * Link a new secondary email (globally unique). The link is UNVERIFIED: a
 * verification message is sent to the address, and only after clicking it can
 * the email sign in / become primary. Requires mail delivery to be configured.
 */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const { email } = await readBody<{ email?: string }>(event);
  if (!email?.trim()) {
    throw createError({ statusCode: 400, statusMessage: "Email is required" });
  }
  const accountLimit = checkAccountSend(user.id);
  if (!accountLimit.allowed) throw createError(emailLimitError(accountLimit));

  let token: string;
  try {
    token = await addEmail(user.id, email);
  } catch (e) {
    throw createError({
      statusCode: 400,
      statusMessage: (e as Error).message || "Failed to add",
    });
  }

  // Send the verification mail (per-recipient rate limit).
  const to = email.trim().toLowerCase();
  const limit = checkEmailSend("email-verification", to);
  if (!limit.allowed) throw createError(emailLimitError(limit));
  try {
    await sendVerificationEmail(
      to,
      token,
      event.headers.get("origin") ?? undefined,
    );
  } catch (e) {
    // Mail not configured / send failed — the row stays unverified; tell the
    // caller to configure delivery and resend.
    throw createError({
      statusCode: 503,
      statusMessage:
        "Linked, but the verification email could not be sent — configure mail delivery in Settings, then resend. " +
        (e as Error).message,
    });
  }
  return { ok: true, emails: await listEmails(user.id) };
});
