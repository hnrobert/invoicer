// Site-wide email theme for the email-poster preset templates: the neutral
// dark primary from the UI (assets/css/main.css --primary, oklch 0.22 ≈
// #1C1917 — dark button with light ink, as the old hand-rolled CTA), the
// favicon as an inlined logo, and the site's own brand footer (the old
// template had been copied from the verifier and still said "UNNC Freshmen
// Verifier Gateway").

import type { EmailTheme } from "email-poster/template";

export const SITE_BRAND_TITLE = "Invoicer";

/** The site theme for site-level emails (test mail, audit reports). */
export function siteTheme(): EmailTheme {
  return {
    brandTitle: SITE_BRAND_TITLE,
    logo: useRuntimeConfig().emailLogo as string | undefined,
    primaryColor: "#1C1917",
    footerHtml: `Sent by ${SITE_BRAND_TITLE} · © ${new Date().getUTCFullYear()}`,
  };
}
