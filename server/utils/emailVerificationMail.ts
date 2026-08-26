import { renderCardEmail } from "email-poster/template";
import { siteTheme } from "#server/mail/theme";
import { sendMail } from "./mail";

/** Site origin for verification links (SITE_URL > per-request fallback). */
export function siteOrigin(fallback?: string): string {
  const raw = (process.env.SITE_URL || "").trim();
  if (raw) return raw.replace(/\/+$/, "");
  return (fallback || "http://localhost:10752").replace(/\/+$/, "");
}

/** Send the 6-digit verification code message; returns the message id. */
export async function sendVerificationCodeEmail(
  to: string,
  code: string,
): Promise<string> {
  const html = renderCardEmail(
    {
      title: "Email verification code",
      bodyHtml: `
        <p style="margin:0 0 12px;">Enter this code in Settings → Emails to finish linking <b>${to}</b> to your Invoicer account:</p>
        <p style="margin:0 0 12px;font-size:32px;font-weight:700;letter-spacing:8px;">${code}</p>
        <p style="margin:0;color:#6b7280;font-size:12px;">This code expires in 10 minutes. If you didn't request it, ignore this email.</p>`,
      preheader: `Verification code ${code.slice(0, 3)}··`,
    },
    siteTheme(),
  );
  return sendMail({
    to,
    subject: "Invoicer · Verification code",
    body: html,
    html: true,
  });
}
