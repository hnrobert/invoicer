import { consumeEmailVerification } from "#server/utils/emails";
import { siteOrigin } from "#server/utils/emailVerificationMail";

/**
 * Consume an email-verification token from the emailed link. Public (the
 * token IS the secret); redirects back to Settings → Emails with a result
 * flag the page turns into a toast.
 */
export default defineEventHandler(async (event) => {
  const token = getQuery(event).token?.toString() ?? "";
  const ok = token ? await consumeEmailVerification(token) : false;
  const base = `${siteOrigin(event.headers.get("origin") ?? undefined)}/settings`;
  return sendRedirect(
    event,
    ok
      ? `${base}?section=emails&verified=1`
      : `${base}?section=emails&verified=0`,
    302,
  );
});
