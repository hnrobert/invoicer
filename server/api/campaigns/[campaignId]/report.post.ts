import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import { requireCampaignAccess, usesSubmitFlow } from "#server/utils/campaign";
import { calcTotal } from "#server/utils/serialize";
import { renderCardEmail, escapeHtml } from "email-poster/template";
import { siteTheme } from "#server/mail/theme";
import { sendMail } from "#server/utils/mail";
import { checkAccountSend, checkEmailSend, emailLimitError } from "#server/utils/emailLimit";

function esc(s: string | null | undefined): string {
  return escapeHtml(s ?? "");
}

const STATUS_LABEL: Record<string, string> = {
  qualified: "Qualified",
  review: "Needs review",
  unqualified: "Unqualified",
  pending: "Pending",
  processing: "Processing",
  error: "Error",
};

/** Email a campaign's audit report (table + total) to a recipient. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { campaign, rights, user } = await requireCampaignAccess(event, campaignId);
  // The report contains everyone's invoices — an export-grade action. Legacy
  // campaigns keep the old behavior (any member may send it).
  if (!rights.canExport && !rights.legacy) {
    throw createError({ statusCode: 403, statusMessage: "No export/report permission" });
  }
  const { to } = await readBody<{ to?: string }>(event);
  if (!to)
    throw createError({ statusCode: 400, statusMessage: "Recipient email is required" });

  // Rate limits: per sender (aggregated across their sends) and per recipient.
  const accountLimit = checkAccountSend(user.id);
  if (!accountLimit.allowed) throw createError(emailLimitError(accountLimit));
  const targetLimit = checkEmailSend("report", to);
  if (!targetLimit.allowed) throw createError(emailLimitError(targetLimit));

  const invoices = await AppDataSource.getRepository(Invoice).find({
    where: { campaignId },
    order: { id: "asc" },
  });
  const flow = usesSubmitFlow(campaign) ? ("submit" as const) : ("direct" as const);
  const total = await calcTotal(campaignId, { flow });

  const rows = invoices
    .map((i) => {
      const amt = i.extractedAmount ?? i.manualAmount;
      return `<tr>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;">${esc(i.filename)}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;">${esc(i.extractedTitle)}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;">${esc(i.extractedTaxId)}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">${amt != null ? "¥" + amt.toFixed(2) : "—"}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;">${STATUS_LABEL[i.status] ?? i.status}</td>
      </tr>`;
    })
    .join("");

  const subject = campaign.name
    ? `Invoice audit report · ${campaign.name} · compliant ¥${total.toFixed(2)}`
    : `Invoice audit report · compliant ¥${total.toFixed(2)}`;
  const bodyHtml = `
    <p style="margin:0 0 12px;">Audited <b>${invoices.length}</b> invoice(s); compliant total <b style="color:#1c1917;">¥${total.toFixed(2)}</b>.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;width:100%;">
      <thead><tr style="background:#f9fafb;">
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Filename</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Title</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Tax ID</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">Amount</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:12px 0 0;color:#6b7280;font-size:12px;">Title: ${esc(campaign.expectedTitle)} · Tax ID: ${esc(campaign.expectedTaxId)}</p>`;

  const html = renderCardEmail(
    {
      title: "Invoice audit report",
      bodyHtml,
      preheader: `Compliant ¥${total.toFixed(2)} · ${invoices.length} invoice(s)`,
    },
    siteTheme(),
  );

  const messageId = await sendMail({
    to,
    subject,
    body: html,
    html: true,
  });
  return { ok: true, messageId, total, count: invoices.length, warning: targetLimit.warning };
});
