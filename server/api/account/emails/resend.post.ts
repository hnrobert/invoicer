import { AppDataSource } from "#server/utils/database";
import { UserEmail } from "#server/entities/userEmail.entity";
import { getSessionUser } from "#server/utils/campaign";
import { issueEmailVerification, listEmails } from "#server/utils/emails";
import { sendVerificationEmail } from "#server/utils/emailVerificationMail";
import {
  checkAccountSend,
  checkEmailSend,
  emailLimitError,
} from "#server/utils/emailLimit";

/** Re-send the verification message for one of the caller's UNVERIFIED emails. */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const { email } = await readBody<{ email?: string }>(event);
  const e = (email ?? "").trim().toLowerCase();
  if (!e) {
    throw createError({ statusCode: 400, statusMessage: "Email is required" });
  }

  const repo = AppDataSource.getRepository(UserEmail);
  const row = await repo.findOneBy({ userId: user.id, email: e });
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: "Not linked" });
  }
  if (row.verifiedAt) {
    throw createError({ statusCode: 400, statusMessage: "Already verified" });
  }

  const accountLimit = checkAccountSend(user.id);
  if (!accountLimit.allowed) throw createError(emailLimitError(accountLimit));
  const limit = checkEmailSend("email-verification", e);
  if (!limit.allowed) throw createError(emailLimitError(limit));

  const token = await issueEmailVerification(user.id, e);
  try {
    await sendVerificationEmail(
      e,
      token,
      event.headers.get("origin") ?? undefined,
    );
  } catch (err) {
    throw createError({
      statusCode: 503,
      statusMessage:
        "Verification email could not be sent — check the mail delivery settings. " +
        (err as Error).message,
    });
  }
  return { ok: true, emails: await listEmails(user.id) };
});
