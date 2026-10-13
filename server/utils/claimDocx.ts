import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

/**
 * Fill the official UNNC claim-form .docx mould (附件3 学生活动经费报销表)
 * with a campaign's claim data. The mould ships in server/assets/claim-mould.docx
 * and contains NO placeholders — table 0 has labelled blank value cells and
 * table 1 has 11 pre-numbered blank detail rows — so this operates directly
 * on word/document.xml: values are injected as runs into the empty cell
 * following each label, and detail rows are filled top-down (extra rows
 * cloned from the first data row when there are more than 11 items).
 */

export interface ClaimDocxData {
  applicant: string;
  phone: string;
  organization: string;
  activity: string;
  /** Grand total in arabic numerals, e.g. "5418.05". */
  totalArabic: string;
  /** Grand total in Chinese capital letters, e.g. 伍仟肆佰壹拾捌元零伍分. */
  totalChinese: string;
  rows: {
    no: number;
    receiptItem: string;
    concreteItem: string;
    unitPrice: string;
    quantity: string;
    amount: string;
    note: string;
  }[];
}

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** A run-wrapped paragraph injected into a (blank) table cell. */
const para = (text: string): string =>
  `<w:p><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="21"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;

function cellsOf(rowXml: string): string[] {
  return rowXml.split(/(?=<w:tc>)/).filter((c) => c.startsWith("<w:tc>"));
}

/** Replace the paragraph content of a table cell, keeping its properties. */
function setCellText(cellXml: string, text: string): string {
  const open = cellXml.indexOf(">") + 1; // end of <w:tc ...>
  const close = cellXml.lastIndexOf("</w:tc>");
  return cellXml.slice(0, open) + para(text) + cellXml.slice(close);
}

function rowText(rowXml: string): string {
  return (
    rowXml
      .match(/<w:t[^>]*>([^<]*)<\/w:t>/g)
      ?.map((t) => t.replace(/<[^>]+>/g, ""))
      .join("") ?? ""
  );
}

/** Find the header table row containing `label`, then fill its blank cells. */
function fillHeaderRow(
  tbl: string,
  label: string,
  values: (string | undefined)[],
): string {
  const rows = tbl.split(/(?=<w:tr[ >])/).filter((r) => r.includes("<w:tr"));
  const idx = rows.findIndex((r) => rowText(r).includes(label));
  if (idx < 0) return tbl;
  const cells = cellsOf(rows[idx]!);
  values.forEach((v, vi) => {
    // value cells come AFTER the label cell(s): offset from the end so the
    // layout ("Applicant | _ | Contact Number | _") fills right-to-left pairs
    const target = cells.length - values.length + vi;
    if (v != null && cells[target])
      cells[target] = setCellText(cells[target], v);
  });
  rows[idx] = cells.join("");
  return rows.join("");
}

export function fillClaimDocx(mould: Uint8Array, data: ClaimDocxData): Buffer {
  const files = unzipSync(mould);
  let xml = strFromU8(files["word/document.xml"]!);

  const tbls = xml.match(/<w:tbl>.*?<\/w:tbl>/gs) ?? [];
  if (tbls.length < 2) throw new Error("claim mould: expected 2 tables");
  const [head, detail] = tbls;

  // ---- header table ----
  let headFilled = head!;
  headFilled = fillHeaderRow(headFilled, "Applicant", [
    undefined,
    data.applicant,
    undefined,
    data.phone,
  ]);
  headFilled = fillHeaderRow(headFilled, "Name of Organization", [
    undefined,
    data.organization,
  ]);
  headFilled = fillHeaderRow(headFilled, "Activity Details", [
    undefined,
    data.activity,
  ]);
  headFilled = fillHeaderRow(headFilled, "In Chinese Capital Letters", [
    undefined,
    data.totalChinese,
  ]);
  headFilled = fillHeaderRow(headFilled, "In Arabic Numerals", [
    undefined,
    data.totalArabic,
  ]);

  // ---- detail table ----
  const rows = detail!
    .split(/(?=<w:tr[ >])/)
    .filter((r) => r.includes("<w:tr"));
  // data rows = rows whose text is ONLY a number (the pre-numbered blanks)
  const dataRowIdx = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => /^\d+$/.test(rowText(r).trim()))
    .map(({ i }) => i);
  const template = rows[dataRowIdx[0]!] ?? rows[3];

  const built: string[] = [];
  for (const row of data.rows) {
    const cells = cellsOf(template!);
    const vals = [
      String(row.no),
      row.receiptItem,
      row.concreteItem,
      row.unitPrice,
      row.quantity,
      row.amount,
      row.note,
    ];
    vals.forEach((v, vi) => {
      if (cells[vi]) cells[vi] = setCellText(cells[vi], v);
    });
    built.push(cells.join(""));
  }
  // splice the built rows over the FIRST pre-numbered slots; keep any
  // remaining blank rows for hand-filling, clone template when >11 items
  const first = dataRowIdx[0] ?? 3;
  const outRows = [
    ...rows.slice(0, first),
    ...built,
    ...rows.slice(first + built.length),
  ];

  xml = xml.replace(head!, headFilled).replace(detail!, outRows.join(""));

  files["word/document.xml"] = strToU8(xml);
  return Buffer.from(zipSync(files));
}
