import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import { fillClaimDocx } from "#server/utils/claimDocx";
import AdmZip from "adm-zip";
import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import { CampaignItem } from "#server/entities/campaignItem.entity";
import { CampaignGroup } from "#server/entities/campaignGroup.entity";
import type { Campaign } from "#server/entities/campaign.entity";
import { usesSubmitFlow } from "#server/utils/campaign";
import { calcTotal } from "#server/utils/serialize";
import { sqlAll, sqlGet } from "#server/utils/auth";
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

export type ExportFormat = "csv" | "xlsx" | "zip" | "claim" | "package";

/**
 * Export a campaign's full invoice data (Editor+ / legacy). Formats:
 *  - csv: flat table incl. uploader identity, amounts, status, review state
 *  - xlsx: two sheets (summary + detail)
 *  - zip: the original invoice files, grouped by review state / uploader
 *  - claim: UNNC "学生活动经费报销表 Students Activity Expenses Claim Form"
 *    (Attachment 2 of the DCL fund regulations) — one row per reimbursement
 *    item, totals in Chinese capital letters, fixed university invoice
 *    header confirmation at the bottom.
 * Every export is audit-logged. Returns the bytes + download metadata; the
 * API layer shapes the actual Response.
 */

/** 1234.50 → 壹仟贰佰叁拾肆元伍角 (RMB Chinese-capital form, claim form). */
function rmbUppercase(n: number): string {
  const digits = "零壹贰叁肆伍陆柒捌玖";
  const units = ["", "拾", "佰", "仟"];
  const bigUnits = ["", "万", "亿"];
  const [intPart = "0", decPart = "00"] = n.toFixed(2).split(".");
  if (Number(intPart) === 0 && Number(decPart) === 0) return "零元整";
  let intStr = "";
  const groups: string[] = [];
  for (let g = intPart.length; g > 0; g -= 4) {
    groups.unshift(intPart.slice(Math.max(0, g - 4), g));
  }
  groups.forEach((g, gi) => {
    let seg = "";
    let zeroPending = false;
    for (let i = 0; i < g.length; i++) {
      const d = Number(g[i]);
      const unit = units[g.length - 1 - i] ?? "";
      if (d === 0) {
        zeroPending = seg.length > 0;
      } else {
        if (zeroPending) seg += "零";
        zeroPending = false;
        seg += digits[d] + unit;
      }
    }
    if (seg) intStr += seg + bigUnits[groups.length - 1 - gi];
  });
  if (Number(intPart) === 0) intStr = "";
  let decStr = "";
  const jiao = Number(decPart[0]);
  const fen = Number(decPart[1]);
  if (jiao > 0) decStr += digits[jiao] + "角";
  if (fen > 0)
    decStr += (jiao > 0 ? "" : intStr ? "零" : "") + digits[fen] + "分";
  if (!decStr) decStr = "整";
  return `${intStr ? intStr + "元" : ""}${decStr}`;
}

/**
 * The item line printed on the invoice ("发票内容"), e.g. "*印刷品*扇子" —
 * the 数电票 line-item format "*category*name". The PDF value stream wraps
 * long names across lines, so fold CJK/letter newlines first ("文宣品设\n计
 * 制作" → one token).
 */
function receiptItemOf(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.replace(/([一-鿿A-Za-z])\n(?=[一-鿿A-Za-z])/g, "$1");
  // Name ends where the QUANTITY column starts ("␣+digits"): "*印刷品*扇子 把
  // 200 1.03…" → "扇子 把" → trailing unit word stripped → "扇子".
  const m = t.match(/\*([^*\n]{1,14})\*(.{1,36}?)\s+\d/);
  if (!m?.[2]) return null;
  const name = m[2]
    .replace(/\s*[把张个件套次箱支盒]\s*$/, "")
    .replace(/[\s.。·]+$/, "")
    .trim();
  return name.length >= 2 ? `*${m[1]}*${name}` : null;
}

/** The per-item claim rows shared by the xlsx claim sheet and the docx package. */
async function buildClaimRows(
  campaignId: number,
  invoices: Invoice[],
): Promise<
  {
    no: number;
    receiptItem: string;
    concreteItem: string;
    amount: number | null;
    note: string;
    channel: string | null;
  }[]
> {
  const items = await AppDataSource.getRepository(CampaignItem).find({
    where: { campaignId },
    order: { id: "asc" },
  });
  const groups = await AppDataSource.getRepository(CampaignGroup).find({
    where: { campaignId },
  });
  const groupName = (gid: number | null) =>
    gid == null ? null : (groups.find((g) => g.id === gid)?.name ?? null);
  const rows: {
    no: number;
    receiptItem: string;
    concreteItem: string;
    amount: number | null;
    note: string;
    channel: string | null;
  }[] = [];
  const claimedInvoiceIds = new Set<number>();
  for (const it of items) {
    const mine = invoices.filter((i) => i.itemId === it.id);
    mine.forEach((i) => claimedInvoiceIds.add(i.id));
    const formal = mine.filter(
      (i) => i.kind === "invoice" && i.status === "qualified",
    );
    const sum = formal.reduce((s, i) => s + (amountOf(i) ?? 0), 0);
    const main = formal[0] ?? mine[0];
    rows.push({
      no: rows.length + 1,
      receiptItem:
        receiptItemOf(main?.rawText ?? null) ??
        main?.extractedMerchant ??
        main?.extractedTitle ??
        "",
      concreteItem: it.name,
      amount: formal.length ? Math.round(sum * 100) / 100 : null,
      note: [
        it.payer ? `垫付人: ${it.payer}` : "",
        it.note ?? "",
        formal.length ? "" : "待补票",
      ]
        .filter(Boolean)
        .join(" · "),
      channel: groupName(it.groupId),
    });
  }
  for (const i of invoices) {
    if (claimedInvoiceIds.has(i.id)) continue;
    if (!(i.kind === "invoice" && i.status === "qualified")) continue;
    rows.push({
      no: rows.length + 1,
      receiptItem:
        receiptItemOf(i.rawText) ??
        i.extractedMerchant ??
        i.extractedTitle ??
        "",
      concreteItem: i.filename.replace(/\.[a-z0-9]+$/i, ""),
      amount: amountOf(i),
      note: "",
      channel: groupName(i.groupId),
    });
  }
  return rows;
}

/** Build the UNNC claim-form workbook (see Attachment 2 of the regulations). */
async function buildClaimWorkbook(
  user: Pick<AuthUser, "id" | "name">,
  campaign: Campaign,
  campaignId: number,
  invoices: Invoice[],
): Promise<ExcelJS.Buffer> {
  const rows = await buildClaimRows(campaignId, invoices);
  const total = rows.reduce((s, r) => s + (r.amount ?? 0), 0);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("报销表", {
    pageSetup: { paperSize: 9, orientation: "portrait" },
  });
  ws.columns = [
    { width: 5 }, // No.
    { width: 22 }, // Item shown on receipt
    { width: 22 }, // Concrete item
    { width: 10 }, // Unit price
    { width: 8 }, // Quantity
    { width: 12 }, // Amount
    { width: 18 }, // Note
  ];

  const mergeCenter = (range: string, text: string, bold = false) => {
    ws.mergeCells(range);
    const c = ws.getCell(range.split(":")[0]!);
    c.value = text;
    c.font = { bold, size: bold ? 12 : 10 };
    c.alignment = { horizontal: "center", vertical: "middle" };
  };
  const field = (row: number, label: string, value: string) => {
    mergeCenter(`B${row}:C${row}`, label);
    mergeCenter(`D${row}:G${row}`, value);
  };

  // Header identity: the exporting user (name + Settings→Profile phone) and
  // the campaign's organization (personal campaigns leave the org blank).
  const idRow = await sqlGet<{
    displayName: string | null;
    phone: string | null;
  }>('SELECT "displayName", "phone" FROM "user" WHERE id = $1', [user.id]);
  const orgRow = campaign.organizationId
    ? await sqlGet<{ name: string }>(
        'SELECT "name" FROM "organization" WHERE id = $1',
        [campaign.organizationId],
      )
    : undefined;

  mergeCenter("A1:G1", "学生活动经费报销表", true);
  mergeCenter("A2:G2", "Students Activity Expenses Claim Form");
  field(4, "Applicant 申请人", idRow?.displayName || user.name);
  field(5, "Contact Number 联系电话", idRow?.phone ?? "");
  field(6, "Name of Organization 社团/组织", orgRow?.name ?? "");
  field(
    7,
    "Activity Details 活动信息",
    campaign.name || campaign.expectedTitle || `campaign #${campaignId}`,
  );
  field(8, "Claims Amounts 大写", rmbUppercase(total));
  field(9, "Claims Amounts (Arabic) 小写", `¥${total.toFixed(2)}`);

  const headerRow = ws.getRow(11);
  headerRow.values = [
    "No.",
    "Item (Shown on receipt)\n发票内容",
    "Item (concrete item)\n实际内容",
    "Unit Price\n单价",
    "Quantity\n数量",
    "Amount\n总金额",
    "Note\n备注",
  ];
  headerRow.height = 30;
  headerRow.eachCell((c) => {
    c.font = { bold: true, size: 9 };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });
  // Example row, as printed on the official form.
  const eg = ws.getRow(12);
  eg.values = ["E.G.", "节庆用品", "气球", 2.0, 10, 20.0, ""];
  eg.font = { size: 9, italic: true, color: { argb: "FF808080" } };

  let r = 13;
  const thin = {
    top: { style: "thin" as const },
    left: { style: "thin" as const },
    bottom: { style: "thin" as const },
    right: { style: "thin" as const },
  };
  let lastChannel: string | null = null;
  for (const row of rows) {
    if (row.channel && row.channel !== lastChannel) {
      mergeCenter(`A${r}:G${r}`, `— ${row.channel} —`);
      ws.getRow(r).font = { bold: true, size: 9 };
      r++;
    }
    lastChannel = row.channel;
    const xr = ws.getRow(r);
    xr.values = [
      row.no,
      row.receiptItem,
      row.concreteItem,
      null, // unit price — left for the claimant to fill
      null, // quantity — left for the claimant to fill
      row.amount,
      row.note,
    ];
    xr.font = { size: 9 };
    xr.eachCell({ includeEmpty: true }, (c) => {
      c.border = thin;
      c.alignment = { vertical: "middle", wrapText: true };
    });
    xr.getCell(6).numFmt = "#,##0.00";
    r++;
  }

  r += 1;
  mergeCenter(
    `A${r}:G${r}`,
    "Please confirm the receipts information（请确认发票信息正确）:",
  );
  ws.getRow(r).font = { bold: true, size: 10 };
  mergeCenter(`A${r + 1}:G${r + 1}`, "发票抬头：宁波诺丁汉大学");
  mergeCenter(`A${r + 2}:G${r + 2}`, "纳税人识别号：1233000077647510XG");
  return wb.xlsx.writeBuffer();
}
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

  if (format === "claim") {
    const buf = await buildClaimWorkbook(user, campaign, campaignId, invoices);
    return {
      body: buf as ArrayBuffer,
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: `${safeName}-报销表.xlsx`,
    };
  }

  if (format === "package") {
    const buf = await buildClaimPackage(user, campaign, campaignId, invoices);
    return {
      body: buf as unknown as ArrayBuffer,
      contentType: "application/zip",
      filename: `${safeName}-报销包.zip`,
    };
  }

  /**
   * The one-click claim PACKAGE: the official docx mould filled with the
   * campaign's claim rows + the invoice files and order screenshots in
   * separate folders + the participant roster xlsx. Layout mirrors the
   * finance team's hand-assembled packages:
   *
   *   20261013.CPU迎新报销表.V1.何思源.docx
   *   CPU迎新发票/01-扇子×200-210.00-发票.pdf …
   *   CPU迎新订单截图/01-扇子×200-209.00-订单截图.jpg …
   *   CPU迎新参与人员名单.xlsx
   */
  async function buildClaimPackage(
    user: Pick<AuthUser, "id" | "name">,
    campaign: Campaign,
    campaignId: number,
    invoices: Invoice[],
  ): Promise<Buffer> {
    const rows = await buildClaimRows(campaignId, invoices);
    const total = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
    const idRow = await sqlGet<{
      displayName: string | null;
      phone: string | null;
      chineseId: string | null;
    }>(
      'SELECT "displayName", "phone", "chineseId" FROM "user" WHERE id = $1',
      [user.id],
    );
    const orgRow = campaign.organizationId
      ? await sqlGet<{ name: string }>(
          'SELECT "name" FROM "organization" WHERE id = $1',
          [campaign.organizationId],
        )
      : undefined;
    const applicant = idRow?.displayName || user.name;
    const activity =
      campaign.name || campaign.expectedTitle || `campaign #${campaignId}`;
    const safeAct = activity.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40);
    const dateTag = new Date().toISOString().slice(0, 10).replaceAll("-", "");

    // 1) filled docx from the official mould
    const mouldPath =
      process.env.CLAIM_MOULD_PATH ||
      resolve(process.cwd(), "server/assets/claim-mould.docx");
    const mould = readFileSync(mouldPath);
    const docx = fillClaimDocx(mould, {
      applicant,
      phone: idRow?.phone ?? "",
      payeeName: idRow?.displayName || applicant,
      payeeChineseId: idRow?.chineseId ?? "",
      organization: orgRow?.name ?? "",
      activity,
      totalArabic: total.toFixed(2),
      totalChinese: rmbUppercase(total),
      rows: rows.map((r) => ({
        no: r.no,
        receiptItem: r.receiptItem,
        concreteItem: r.concreteItem,
        unitPrice: "",
        quantity: "",
        amount: r.amount != null ? r.amount.toFixed(2) : "",
        note: r.note,
      })),
    });

    const zip = new AdmZip();
    zip.addFile(
      `${dateTag}.${safeAct}报销表.V1.${applicant.replace(/[\\/:*?"<>|\s]+/g, "_")}.docx`,
      docx,
    );

    // 2) invoice files / order screenshots in separate folders (zip naming rules)
    const items = await AppDataSource.getRepository(CampaignItem).find({
      where: { campaignId },
      order: { id: "asc" },
    });
    const itemNo = new Map(items.map((it, ix) => [it.id, ix + 1]));
    const KIND_LABEL: Record<string, string> = {
      invoice: "发票",
      quotation: "报价单",
      receipt: "订单截图",
    };
    const used = new Set<string>();
    for (const i of invoices) {
      const data = await storage.getBuffer(i.savedPath).catch(() => null);
      if (!data) continue;
      const ext = (i.filename.match(/\.[a-z0-9]+$/i) ?? [""])[0]!;
      const amount = amountOf(i);
      const label = KIND_LABEL[i.kind] ?? i.kind;
      const base = i.itemId
        ? (itemNo.get(i.itemId) ?? items.length).toString().padStart(2, "0") +
          "-" +
          (items.find((it) => it.id === i.itemId)?.name ?? "未归类")
        : "未归类-" + i.filename.replace(/\.[a-z0-9]+$/i, "");
      let name =
        `${base}${amount != null ? `-${amount.toFixed(2)}` : ""}-${label}${ext}`
          .replace(/[\\/:*?"<>|]+/g, "_")
          .replace(/\s+/g, "_")
          .slice(0, 120);
      for (let n = 2; used.has(name); n++)
        name = name.replace(/(\.[^.]+)$/, `-${n}$1`);
      used.add(name);
      const folder =
        i.kind === "invoice" ? `${safeAct}发票` : `${safeAct}订单截图`;
      zip.addFile(`${folder}/${name}`, data);
    }

    // 3) participant roster xlsx (Name / 姓名 / 学号), only when configured
    const roster = JSON.parse(campaign.participants || "[]") as {
      en?: string;
      zh?: string;
      id?: string;
    }[];
    if (roster.length) {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("名单");
      ws.columns = [
        { header: "Name", width: 24 },
        { header: "姓名", width: 16 },
        { header: "学号", width: 14 },
      ];
      ws.getRow(1).font = { bold: true };
      for (const r of roster) ws.addRow([r.en ?? "", r.zh ?? "", r.id ?? ""]);
      const buf = await wb.xlsx.writeBuffer();
      zip.addFile(`${safeAct}参与人员名单.xlsx`, Buffer.from(buf));
    }

    return zip.toBuffer();
  }

  // zip: every original file, FLAT and renamed to the reimbursement naming
  // convention the finance team uses by hand — "NN-条目名-金额-类型.ext":
  // files of one item cluster together in file managers and reviewers can
  // match invoice ↔ evidence without opening anything. Unattached files keep
  // their original name under a trailing "未归类" bucket number.
  const zipItems = await AppDataSource.getRepository(CampaignItem).find({
    where: { campaignId },
    order: { id: "asc" },
  });
  const itemNo = new Map(zipItems.map((it, ix) => [it.id, ix + 1]));
  const KIND_LABEL: Record<string, string> = {
    invoice: "发票",
    quotation: "报价单",
    receipt: "订单截图",
  };
  const usedNames = new Set<string>();
  const zip = new AdmZip();
  let missing = 0;
  const unattachedIx = zipItems.length;
  for (const i of invoices) {
    const data = await storage.getBuffer(i.savedPath).catch(() => null);
    if (!data) {
      missing++;
      continue;
    }
    const ext = (i.filename.match(/\.[a-z0-9]+$/i) ?? [""])[0]!;
    const amount = amountOf(i);
    const label = KIND_LABEL[i.kind] ?? i.kind;
    const base = i.itemId
      ? (itemNo.get(i.itemId) ?? unattachedIx).toString().padStart(2, "0") +
        "-" +
        (zipItems.find((it) => it.id === i.itemId)?.name ?? "未归类")
      : "未归类-" + i.filename.replace(/\.[a-z0-9]+$/i, "");
    let name =
      `${base}${amount != null ? `-${amount.toFixed(2)}` : ""}-${label}${ext}`
        .replace(/[\\/:*?"<>|]+/g, "_")
        .replace(/\s+/g, "_")
        .slice(0, 120);
    // same item + same amount + same kind (rare): dedupe with a counter
    for (let n = 2; usedNames.has(name); n++) {
      name = name.replace(/(\.[^.]+)$/, `-${n}$1`);
    }
    usedNames.add(name);
    zip.addFile(name, data);
  }
  if (missing) {
    console.warn(
      `[export] campaign #${campaignId}: ${missing} file(s) missing from storage and skipped`,
    );
  }
  return {
    body: zip.toBuffer(),
    contentType: "application/zip",
    filename: `${safeName}.zip`,
  };
}
