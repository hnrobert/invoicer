import { renderCardEmail } from "email-poster/template";
import { siteTheme } from "#server/mail/theme";
import { sendMail } from "#server/utils/mail";
import {
  checkAccountSend,
  checkEmailSend,
  emailLimitError,
} from "#server/utils/emailLimit";
import { requireSuperAdmin } from "#server/utils/superadmin";

/** Send a test email using the configured site SMTP settings. */
export default defineEventHandler(async (event) => {
  const user = await requireSuperAdmin(event);
  const { to } = await readBody<{ to?: string }>(event);
  if (!to)
    throw createError({
      statusCode: 400,
      statusMessage: "Recipient email is required",
    });

  // Rate limits: per sender (aggregated across their sends) and per recipient.
  const accountLimit = checkAccountSend(user.id);
  if (!accountLimit.allowed) throw createError(emailLimitError(accountLimit));
  const limit = checkEmailSend("test", to);
  if (!limit.allowed) throw createError(emailLimitError(limit));

  const html = renderCardEmail(
    {
      title: "Test email",
      bodyHtml:
        "<p>This is a test email from Invoicer — receiving it means the mail delivery configuration works.</p>",
      preheader: "Invoicer test email",
    },
    siteTheme(),
  );
  const messageId = await sendMail({
    to,
    subject: "Invoicer · Test email",
    body: html,
    html: true,
  });
  return { ok: true, messageId };
});
