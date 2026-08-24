import { renderCardEmail } from "email-poster/template";
import { siteTheme } from "#server/mail/theme";
import { sendMail } from "./mail";

/** Site origin for verification links (SITE_URL > per-request fallback). */
export function siteOrigin(fallback?: string): string {
  const raw = (process.env.SITE_URL || "").trim();
  if (raw) return raw.replace(/\/+$/, "");
  return (fallback || "http://localhost:10752").replace(/\/+$/, "");
}

/** Send the "verify this email" message; returns the message id. */
export async function sendVerificationEmail(
  to: string,
  token: string,
  origin?: string,
): Promise<string> {
  const url = `${siteOrigin(origin)}/api/account/emails/verify?token=${encodeURIComponent(token)}`;
  const html = renderCardEmail(
    {
      title: "Verify your email",
      bodyHtml: `
        <p style="margin:0 0 12px;">Confirm this address to finish linking it to your Invoicer account. Verified emails can sign in and become your primary address.</p>
        <p style="margin:0;color:#6b7280;font-size:12px;">This link expires in 24 hours. If you didn't request it, ignore this email.</p>`,
      preheader: "Confirm this address to link it to your account",
      actionLabel: "Verify email",
      actionUrl: url,
    },
    siteTheme(),
  );
  return sendMail({
    to,
    subject: "Invoicer · Verify your email",
    body: html,
    html: true,
  });
}
