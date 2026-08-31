import { basename } from "node:path";
import ExcelJS from "exceljs";
import AdmZip from "adm-zip";
import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import type { Campaign } from "#server/entities/campaign.entity";
import { usesSubmitFlow } from "#server/utils/campaign";
import { calcTotal } from "#server/utils/serialize";
import { sqlAll } from "#server/utils/auth";
import { logAudit } from "#server/utils/audit";
import { storage } from "#server/utils/storage";
import type { AuthUser, CampaignRights } from "#shared/types";

const STATUS_LABEL: Record<string, string> = {
  qualified: "Qualified",
  manual: "Internal review",
  unqualified: "Unqualified",
  pending: "Pending",
  processing: "Processing",
  error: "Error",
};
const RSTATE_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
};

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function amountOf(i: Invoice): number | null {
  return i.extractedAmount ?? i.manualAmount;
}

export type ExportFormat = "csv" | "xlsx" | "zip";

/**
 * Export a campaign's full invoice data (Editor+ / legacy). Three formats:
 *  - csv: flat table incl. uploader identity, amounts, status, review state
 *  - xlsx: two sheets (summary + detail)
 *  - zip: the original invoice files, grouped by review state / uploader
 * Every export is audit-logged. Returns the bytes + download metadata; the
 * API layer shapes the actual Response.
 */
export async function exportCampaign(
  user: Pick<AuthUser, "id" | "name" | "email">,
  campaign: Campaign,
  rights: CampaignRights,
  format: ExportFormat,
): Promise<{
  body: BlobPart;
  contentType: string;
  filename: string;
}> {
  const campaignId = campaign.id;
  if (!rights.canExport && !rights.legacy) {
    throw createError({
      statusCode: 403,
      statusMessage: "No export permission",
    });
  }

  const invoices = await AppDataSource.getRepository(Invoice).find({
    where: { campaignId },
    order: { id: "asc" },
  });

  // Uploader identity — export-grade (Editor+), so names/emails are included.
  const uploaderIds = [
    ...new Set(
      invoices.map((i) => i.uploaderId).filter((u): u is string => !!u),
    ),
  ];
  const uploaderRows = uploaderIds.length
    ? await sqlAll<{ id: string; name: string; email: string }>(
        `SELECT id, name, email FROM "user" WHERE id IN (${uploaderIds.map((_, i) => `$${i + 1}`).join(",")})`,
        uploaderIds,
      )
    : [];
  const uploaders = new Map(uploaderRows.map((u) => [u.id, u]));
  const upLabel = (i: Invoice) => {
    const u = i.uploaderId ? uploaders.get(i.uploaderId) : undefined;
    return u ? `${u.name} <${u.email}>` : "—";
  };

  const flow = usesSubmitFlow(campaign) ? "submit" : "direct";
  const total = await calcTotal(campaignId, { flow });
  const safeName = (
    campaign.name ||
    campaign.expectedTitle ||
    `campaign-${campaignId}`
  )
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

  if (format === "csv") {
    const header = [
      "ID",
      "Filename",
      "Uploader",
      "Title",
      "Tax ID",
      "Amount",
      "Recognition",
      "Review",
      "Reason",
      "Uploaded at",
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
          flow === "submit"
            ? (RSTATE_LABEL[i.reviewState] ?? i.reviewState)
            : "",
          i.reason ?? "",
          i.createdAt.toISOString(),
        ]
          .map(csvEscape)
          .join(","),
      );
    }
    lines.push("");
    lines.push(
      [
        `Compliant total (${flow === "submit" ? "approved" : "qualified"})`,
        total.toFixed(2),
      ]
        .map(csvEscape)
        .join(","),
    );
    // BOM so Excel opens UTF-8 Chinese correctly.
    return {
      body: "﻿" + lines.join("\r\n"),
      contentType: "text/csv; charset=utf-8",
      filename: `${safeName}.csv`,
    };
  }

  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const summary = wb.addWorksheet("Summary");
    summary.columns = [
      { header: "Campaign", key: "a", width: 28 },
      { header: "Buyer title", key: "b", width: 30 },
      { header: "Tax ID", key: "c", width: 22 },
      { header: "Invoices", key: "d", width: 10 },
      { header: "Compliant total", key: "e", width: 14 },
      { header: "Exported by", key: "f", width: 24 },
      { header: "Exported at", key: "g", width: 22 },
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

    const detail = wb.addWorksheet("Detail");
    detail.columns = [
      { header: "ID", key: "id", width: 8 },
      { header: "Filename", key: "fn", width: 36 },
      { header: "Uploader", key: "up", width: 24 },
      { header: "Title", key: "t", width: 30 },
      { header: "Tax ID", key: "x", width: 22 },
      { header: "Amount", key: "amt", width: 12 },
      { header: "Recognition", key: "s", width: 12 },
      { header: "Review", key: "r", width: 12 },
      { header: "Reason", key: "reason", width: 24 },
      { header: "Uploaded at", key: "at", width: 22 },
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
        r:
          flow === "submit"
            ? (RSTATE_LABEL[i.reviewState] ?? i.reviewState)
            : "",
        reason: i.reason ?? "",
        at: i.createdAt.toISOString(),
      });
    }
    const buf = await wb.xlsx.writeBuffer();
    return {
      body: buf as ArrayBuffer,
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: `${safeName}.xlsx`,
    };
  }

  // zip: original files grouped by review state, then uploader.
  const zip = new AdmZip();
  for (const i of invoices) {
    const data = await storage.getBuffer(i.savedPath).catch(() => null);
    if (!data) continue;
    const group = flow === "submit" ? (i.reviewState ?? "draft") : i.status;
    const upDir =
      (i.uploaderId && uploaders.get(i.uploaderId)?.name) || "unknown";
    const safeUp = upDir.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 40);
    zip.addFile(`${group}/${safeUp}/${basename(i.savedPath)}`, data);
  }
  return {
    body: zip.toBuffer(),
    contentType: "application/zip",
    filename: `${safeName}.zip`,
  };
}
