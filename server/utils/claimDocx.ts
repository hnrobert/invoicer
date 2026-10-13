import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

/**
 * Fill the official UNNC claim-form .docx mould (附件3 学活经费报销表)
 * with a campaign's claim data. The mould ships in server/assets/claim-mould.docx
 * and contains NO placeholders — table 0 has labelled blank value cells and
 * table 1 has 11 pre-numbered blank detail rows — so this operates directly
 * on word/document.xml. Cell edits are IN-PLACE span replacements inside
 * each row string (never re-join cells without their <w:tr> skeleton: that
 * drops the row's opening tag + <w:trPr> and corrupts the XML).
 */

export interface ClaimDocxData {
  applicant: string;
  phone: string;
  /** Prepayment notes: payee real name + Chinese ID (blank = skip). */
  payeeName?: string;
  payeeChineseId?: string;
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

/** A bare run injected INTO the cell's existing paragraph — no rPr, so
 * the text inherits the document/cell default font exactly like hand-typed
 * content; paragraph properties (alignment) stay untouched. */
const run = (text: string): string =>
  `<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;

function rowText(rowXml: string): string {
  return (
    rowXml
      .match(/<w:t[^>]*>([^<]*)<\/w:t>/g)
      ?.map((t) => t.replace(/<[^>]+>/g, ""))
      .join("") ?? ""
  );
}

/** Spans of the row's <w:tc>…</w:tc> cells (cells never nest). */
function cellSpans(rowXml: string): [number, number][] {
  const spans: [number, number][] = [];
  let i = rowXml.indexOf("<w:tc>");
  while (i >= 0) {
    const j = rowXml.indexOf("</w:tc>", i);
    if (j < 0) break;
    spans.push([i, j + "</w:tc>".length]);
    i = rowXml.indexOf("<w:tc>", j);
  }
  return spans;
}

/** REPLACE the text of a cell's FIRST paragraph in-place — paragraph
 * properties (alignment) stay untouched and the injected run carries no
 * rPr, so the font is the document default exactly like hand-typed text.
 * Pre-existing runs in that paragraph are removed first (the mould's
 * pre-numbered No. cells would otherwise double up as "1" + "1").
 * `null` leaves the cell alone (used to skip label cells in pair rows). */
function setCell(rowXml: string, cellIdx: number, text: string | null): string {
  if (text == null) return rowXml;
  const spans = cellSpans(rowXml);
  const target = spans[cellIdx];
  if (!target) return rowXml;
  const [a, b] = target;
  let cell = rowXml.slice(a, b);
  const pOpen = cell.search(/<w:p[ >\/]/);
  if (pOpen < 0) return rowXml;
  // self-closing empty paragraph <w:p …/> → open it up for the run
  const selfClose = /<w:p[^>]*\/\>/.exec(cell.slice(pOpen));
  if (selfClose) {
    const at = pOpen + selfClose[0].length;
    cell = cell.slice(0, at - 2) + ">" + run(text) + "</w:p>" + cell.slice(at);
  } else {
    const pEnd = cell.indexOf("</w:p>", pOpen);
    const seg = cell.slice(pOpen, pEnd);
    // keep the <w:p …> opening tag + <w:pPr>, drop existing runs, add ours
    const open = seg.match(/^<w:p[^>]*>/)?.[0] ?? "<w:p>";
    const pPr = seg.match(/<w:pPr[ >][\s\S]*?<\/w:pPr>|<w:pPr\/>/)?.[0] ?? "";
    cell =
      cell.slice(0, pOpen) + open + pPr + run(text) + cell.slice(pEnd);
  }
  return rowXml.slice(0, a) + cell + rowXml.slice(b);
}

/** Whole <w:tr…>…</w:tr> spans of a table, in order. */
function trSpans(tbl: string): [number, number][] {
  const spans: [number, number][] = [];
  let i = tbl.search(/<w:tr[ >]/);
  while (i >= 0) {
    const j = tbl.indexOf("</w:tr>", i);
    if (j < 0) break;
    spans.push([i, j + "</w:tr>".length]);
    i = tbl.slice(j).search(/<w:tr[ >]/);
    if (i >= 0) i += j;
  }
  return spans;
}

/** Replace text in the blank value cell(s) at the END of a labelled row. */
function fillHeaderRow(
  tbl: string,
  label: string,
  value: string | null,
): string {
  const span = trSpans(tbl).find(([a, b]) =>
    rowText(tbl.slice(a, b)).includes(label),
  );
  if (!span) return tbl;
  const [a, b] = span;
  const row = tbl.slice(a, b);
  const cellCount = cellSpans(row).length;
  // the LAST cell of the row is the blank value slot (labels + previous
  // values come before); "Applicant | _ | Contact Number | _" rows have the
  // value as their 2nd/4th cell — handled by the offset variant below.
  return tbl.slice(0, a) + setCell(row, cellCount - 1, value) + tbl.slice(b);
}

/** Like fillHeaderRow but fills N trailing cells (label/value pairs). */
function fillHeaderPairs(
  tbl: string,
  label: string,
  values: (string | null)[],
): string {
  const span = trSpans(tbl).find(([a, b]) =>
    rowText(tbl.slice(a, b)).includes(label),
  );
  if (!span) return tbl;
  const [a, b] = span;
  let row = tbl.slice(a, b);
  const cellCount = cellSpans(row).length;
  values.forEach((v, vi) => {
    row = setCell(row, cellCount - values.length + vi, v);
  });
  return tbl.slice(0, a) + row + tbl.slice(b);
}

export function fillClaimDocx(mould: Uint8Array, data: ClaimDocxData): Buffer {
  const files = unzipSync(mould);
  let xml = strFromU8(files["word/document.xml"]!);

  const tblSpans: [number, number][] = [];
  let t = xml.indexOf("<w:tbl");
  while (t >= 0) {
    const e = xml.indexOf("</w:tbl>", t);
    if (e < 0) break;
    tblSpans.push([t, e + "</w:tbl>".length]);
    t = xml.indexOf("<w:tbl", e);
  }
  if (tblSpans.length < 2) throw new Error("claim mould: expected 2 tables");

  // ---- header table ----
  let head = xml.slice(...tblSpans[0]!);
  head = fillHeaderPairs(head, "Applicant", [
    null,
    data.applicant,
    null,
    data.phone,
  ]);
  head = fillHeaderRow(head, "Name of Organization", data.organization);
  head = fillHeaderRow(head, "Activity Details", data.activity);
  head = fillHeaderRow(head, "In Chinese Capital Letters", data.totalChinese);
  head = fillHeaderRow(head, "In Arabic Numerals", data.totalArabic);

  // Notes block (prepayment): one row reads "| Name | ␀ | Chinese ID. | ␀ |"
  // — fill the cell RIGHT AFTER each label cell (a whole-row match keeps the
  // short "Name" away from "Name of Organization/Society").
  const notesRow = trSpans(head).find(([a, b]) => {
    const t = rowText(head.slice(a, b));
    return t.includes("Name") && t.includes("Chinese ID.");
  });
  if (notesRow) {
    const [na, nb] = notesRow;
    let row = head.slice(na, nb);
    row.split(/(?=<w:tc>)/)
      .filter((c) => c.startsWith("<w:tc>"))
      .forEach((c, ci, all) => {
        const label = (c.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? [])
          .map((t) => t.replace(/<[^>]+>/g, ""))
          .join("")
          .trim();
        if (label === "Name" && data.payeeName) {
          row = setCell(row, ci + 1 < all.length ? ci + 1 : ci, data.payeeName);
        } else if (label.startsWith("Chinese ID") && data.payeeChineseId) {
          row = setCell(
            row,
            ci + 1 < all.length ? ci + 1 : ci,
            data.payeeChineseId,
          );
        }
      });
    head = head.slice(0, na) + row + head.slice(nb);
  }

  // ---- detail table ----
  const [da, db] = tblSpans[1]!;
  let detail = xml.slice(da, db);
  const rows = trSpans(detail);
  // data rows = rows whose whole text is just their number (1..11 blanks)
  const dataRows = rows.filter(([a, b]) =>
    /^\d+$/.test(rowText(detail.slice(a, b)).trim()),
  );
  const [t0a, t0b] = dataRows[0] ?? rows[3]!;
  const template = detail.slice(t0a, t0b);

  // splice built rows over the pre-numbered slots BY ABSOLUTE POSITION —
  // the blank slot rows are byte-identical, so content-based replace()
  // would keep matching earlier slots and misplace every following row.
  const buildRow = (r: ClaimDocxData["rows"][number]) => {
    let row = template;
    [
      String(r.no),
      r.receiptItem,
      r.concreteItem,
      r.unitPrice,
      r.quantity,
      r.amount,
      r.note,
    ].forEach((v, vi) => (row = setCell(row, vi, v)));
    return row;
  };
  let out = "";
  let cursor = 0;
  dataRows.forEach(([a, b], ix) => {
    const r = data.rows[ix];
    // fewer items than slots → keep the blank numbered row as-is
    out += detail.slice(cursor, a) + (r ? buildRow(r) : detail.slice(a, b));
    cursor = b;
  });
  out += detail.slice(cursor);
  // more items than pre-numbered slots → append clones (template row again)
  for (let ix = dataRows.length; ix < data.rows.length; ix++) {
    out += buildRow(data.rows[ix]!);
  }

  xml =
    xml.slice(0, tblSpans[0]![0]) +
    head +
    xml.slice(tblSpans[0]![1], tblSpans[1]![0]) +
    out +
    xml.slice(tblSpans[1]![1]);

  files["word/document.xml"] = strToU8(xml);
  return Buffer.from(zipSync(files));
}
