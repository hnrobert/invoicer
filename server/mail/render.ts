// The template lives in a standalone authorable file (email/template.html),
// read at Nuxt config time and shipped to the server as a runtimeConfig default
// (runtimeConfig.emailTemplate) — bundled into the build reliably.

export interface EmailContent {
  /** Big heading inside the card. */
  title: string
  /** Inner HTML for the message body (caller-supplied — not escaped). */
  bodyHtml: string
  /** Optional CTA button. Rendered only when both label and url are present. */
  actionLabel?: string
  actionUrl?: string
  /** Optional hidden preview text shown after the subject in inbox lists. */
  preheader?: string
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Render the site-themed HTML email (light by default, dark via prefers-color-scheme). */
export function renderEmail(c: EmailContent): string {
  const template = useRuntimeConfig().emailTemplate as string | undefined
  const logo = useRuntimeConfig().emailLogo as string | undefined
  if (!template) throw new Error('Email template missing (runtimeConfig.emailTemplate)')

  const action =
    c.actionLabel && c.actionUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0 4px;"><tr><td bgcolor="#F7D447" style="border-radius: 10px;"><a href="${escapeHtml(c.actionUrl)}" target="_blank" rel="noopener" style="display: inline-block; padding: 12px 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 600; color: #1c1917; text-decoration: none; border-radius: 10px;">${escapeHtml(c.actionLabel)}</a></td></tr></table>`
      : ''

  return template
    .replaceAll('{{PREHEADER}}', escapeHtml(c.preheader ?? ''))
    .replaceAll('{{TITLE}}', escapeHtml(c.title))
    .replaceAll('{{BODY}}', c.bodyHtml)
    .replaceAll('{{ACTION_BLOCK}}', action)
    .replaceAll('{{YEAR}}', String(new Date().getUTCFullYear()))
    .replaceAll('{{LOGO}}', logo ?? '')
}
