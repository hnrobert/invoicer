import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import { requireCampaignAccess } from "#server/utils/campaign";
import { calcTotal } from "#server/utils/serialize";
import { renderEmail } from "#server/mail/render";
import { sendMail } from "#server/utils/mail";

function esc(s: string | null | undefined): string {
  return (s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const STATUS_LABEL: Record<string, string> = {
  qualified: "合格",
  review: "二次审核",
  unqualified: "不合格",
  pending: "等待",
  processing: "识别中",
  error: "失败",
};

/** Email a campaign's audit report (table + total) to a recipient. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { campaign } = await requireCampaignAccess(event, campaignId);
  const { to } = await readBody<{ to?: string }>(event);
  if (!to)
    throw createError({ statusCode: 400, statusMessage: "请填写收件人邮箱" });

  const invoices = await AppDataSource.getRepository(Invoice).find({
    where: { campaignId },
    order: { id: "asc" },
  });
  const total = await calcTotal(campaignId);

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
    ? `发票审核结果 · ${campaign.name} · 合规金额 ¥${total.toFixed(2)}`
    : `发票审核结果 · 合规金额 ¥${total.toFixed(2)}`;
  const bodyHtml = `
    <p style="margin:0 0 12px;">本次共审核 <b>${invoices.length}</b> 张发票，合规金额合计 <b style="color:#1c1917;">¥${total.toFixed(2)}</b>。</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;width:100%;">
      <thead><tr style="background:#f9fafb;">
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">文件名</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">抬头</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">税号</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">金额</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">状态</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:12px 0 0;color:#6b7280;font-size:12px;">抬头：${esc(campaign.expectedTitle)} · 税号：${esc(campaign.expectedTaxId)}</p>`;

  const html = renderEmail({
    title: "发票审核结果",
    bodyHtml,
    preheader: `合规金额 ¥${total.toFixed(2)} · 共 ${invoices.length} 张`,
  });

  const messageId = await sendMail({
    to,
    subject,
    body: html,
    html: true,
  });
  return { ok: true, messageId, total, count: invoices.length };
});
