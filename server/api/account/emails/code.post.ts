import { AppDataSource } from "#server/utils/database";
import { UserEmail } from "#server/entities/userEmail.entity";
import { getSessionUser } from "#server/utils/campaign";
import { issueEmailCode, listEmails } from "#server/utils/emails";
import type { EmailBody } from "#shared/api";
import { sendVerificationCodeEmail } from "#server/utils/emailVerificationMail";
import {
  checkAccountSend,
  checkEmailSend,
  emailLimitError,
} from "#server/utils/emailLimit";

/** Send a 6-digit verification code to one of the caller's UNVERIFIED emails. */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const { email } = await readBody<EmailBody>(event);
  const e = (email ?? "").trim().toLowerCase();
  if (!e) {
    throw createError({ statusCode: 400, statusMessage: "Email is required" });
  }
  const row = await AppDataSource.getRepository(UserEmail).findOneBy({
    userId: user.id,
    email: e,
  });
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

  const code = await issueEmailCode(user.id, e);
  try {
    await sendVerificationCodeEmail(e, code);
  } catch (err) {
    throw createError({
      statusCode: 503,
      statusMessage:
        "Code email could not be sent — check the mail delivery settings. " +
        (err as Error).message,
    });
  }
  return { ok: true, emails: await listEmails(user.id) };
});
