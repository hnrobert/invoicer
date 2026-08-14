import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import ExcelJS from "exceljs";
import AdmZip from "adm-zip";
import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import { requireCampaignAccess, usesSubmitFlow } from "#server/utils/campaign";
import { calcTotal } from "#server/utils/serialize";
import { authDb } from "#server/utils/auth";
import { logAudit } from "#server/utils/audit";

const STATUS_LABEL: Record<string, string> = {
  qualified: "合格",
  review: "二次审核",
  unqualified: "不合格",
  pending: "等待",
  processing: "识别中",
  error: "失败",
};
const RSTATE_LABEL: Record<string, string> = {
  draft: "草稿",
  submitted: "待审核",
  approved: "已通过",
  rejected: "已驳回",
};

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function amountOf(i: Invoice): number | null {
  return i.extractedAmount ?? i.manualAmount;
}

/**
 * Export a campaign's full invoice data (Editor+ / legacy). Three formats:
 *  - csv: flat table incl. uploader identity, amounts, status, review state
 *  - xlsx: two sheets (summary + detail)
 *  - zip: the original invoice files, grouped by review state / uploader
 * Every export is audit-logged.
 */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const format = (getQuery(event).format ?? "csv").toString();
  if (!["csv", "xlsx", "zip"].includes(format)) {
    throw createError({ statusCode: 400, statusMessage: "format 必须为 csv / xlsx / zip" });
  }
  const { user, campaign, rights } = await requireCampaignAccess(event, campaignId);
  if (!rights.canExport && !rights.legacy) {
    throw createError({ statusCode: 403, statusMessage: "无导出权限" });
  }

  const invoices = await AppDataSource.getRepository(Invoice).find({
    where: { campaignId },
    order: { id: "asc" },
  });

  // Uploader identity — export-grade (Editor+), so names/emails are included.
  const uploaderIds = [
    ...new Set(invoices.map((i) => i.uploaderId).filter((u): u is string => !!u)),
  ];
  const uploaderRows = uploaderIds.length
    ? (authDb
        .prepare(
          `SELECT id, name, email FROM user WHERE id IN (${uploaderIds.map(() => "?").join(",")})`,
        )
        .all(...uploaderIds) as { id: string; name: string; email: string }[])
    : [];
  const uploaders = new Map(uploaderRows.map((u) => [u.id, u]));
  const upLabel = (i: Invoice) => {
    const u = i.uploaderId ? uploaders.get(i.uploaderId) : undefined;
    return u ? `${u.name} <${u.email}>` : "—";
  };

  const flow = usesSubmitFlow(campaign) ? "submit" : "direct";
  const total = await calcTotal(campaignId, { flow });
  const safeName = (campaign.name || campaign.expectedTitle || `campaign-${campaignId}`)
    .replace(/[\\/:*?"<>|\s]+/g, "_")
    .slice(0, 60);

  logAudit({
    organizationId: campaign.organizationId,
    campaignId,
    actorId: user.id,
    action: "campaign.export",
    target: `campaign #${campaignId}`,
    meta: { format, count: invoices.length },
  });

  const download = (data: BlobPart, type: string, ext: string): Response =>
    new Response(data, {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `attachment; filename="${safeName}.${ext}"`,
      },
    });

  if (format === "csv") {
    const header = [
      "ID", "文件名", "上传人", "抬头", "税号", "金额",
      "识别状态", "审核状态", "原因", "上传时间",
    ];
    const lines = [header.map(csvEscape).join(",")];
    for (const i of invoices) {
      lines.push(
        [
          i.id,
          i.filename,
          upLabel(i),
          i.extractedTitle ?? "",
          i.extractedTaxId ?? "",
          amountOf(i) ?? "",
          STATUS_LABEL[i.status] ?? i.status,
          flow === "submit" ? (RSTATE_LABEL[i.reviewState] ?? i.reviewState) : "",
          i.reason ?? "",
          i.createdAt.toISOString(),
        ]
          .map(csvEscape)
          .join(","),
      );
    }
    lines.push("");
    lines.push([`合规总额（${flow === "submit" ? "已审核通过" : "判定合格"}）`, total.toFixed(2)].map(csvEscape).join(","));
    // BOM so Excel opens UTF-8 Chinese correctly.
    return download(
      "﻿" + lines.join("\r\n"),
      "text/csv; charset=utf-8",
      "csv",
    );
  }

  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const summary = wb.addWorksheet("汇总");
    summary.columns = [
      { header: "活动", key: "a", width: 28 },
      { header: "发票抬头", key: "b", width: 30 },
      { header: "税号", key: "c", width: 22 },
      { header: "发票数", key: "d", width: 10 },
      { header: "合规总额", key: "e", width: 14 },
      { header: "导出人", key: "f", width: 24 },
      { header: "导出时间", key: "g", width: 22 },
    ];
    summary.addRow({
      a: campaign.name || campaign.expectedTitle,
      b: campaign.expectedTitle,
      c: campaign.expectedTaxId ?? "",
      d: invoices.length,
      e: total,
      f: `${user.name} <${user.email}>`,
      g: new Date().toISOString(),
    });

    const detail = wb.addWorksheet("明细");
    detail.columns = [
      { header: "ID", key: "id", width: 8 },
      { header: "文件名", key: "fn", width: 36 },
      { header: "上传人", key: "up", width: 24 },
      { header: "抬头", key: "t", width: 30 },
      { header: "税号", key: "x", width: 22 },
      { header: "金额", key: "amt", width: 12 },
      { header: "识别状态", key: "s", width: 12 },
      { header: "审核状态", key: "r", width: 12 },
      { header: "原因", key: "reason", width: 24 },
      { header: "上传时间", key: "at", width: 22 },
    ];
    for (const i of invoices) {
      detail.addRow({
        id: i.id,
        fn: i.filename,
        up: upLabel(i),
        t: i.extractedTitle ?? "",
        x: i.extractedTaxId ?? "",
        amt: amountOf(i),
        s: STATUS_LABEL[i.status] ?? i.status,
        r: flow === "submit" ? (RSTATE_LABEL[i.reviewState] ?? i.reviewState) : "",
        reason: i.reason ?? "",
        at: i.createdAt.toISOString(),
      });
    }
    const buf = await wb.xlsx.writeBuffer();
    return download(
      buf as ArrayBuffer,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "xlsx",
    );
  }

  // zip: original files grouped by review state, then uploader.
  const zip = new AdmZip();
  for (const i of invoices) {
    const data = await readFile(i.savedPath).catch(() => null);
    if (!data) continue;
    const group = flow === "submit" ? (i.reviewState ?? "draft") : i.status;
    const upDir = (i.uploaderId && uploaders.get(i.uploaderId)?.name) || "unknown";
    const safeUp = upDir.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 40);
    zip.addFile(`${group}/${safeUp}/${basename(i.savedPath)}`, data);
  }
  return download(zip.toBuffer(), "application/zip", "zip");
});
