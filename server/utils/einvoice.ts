import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import type { InvoiceFields } from "./fields";
import { extractInvoiceFields } from "./fields";

/**
 * Structured parsing for China digital invoices (数电票/全电发票) — NO OCR:
 * these files carry every field as data.
 *
 *   .xml  the e-invoice platform's raw XML download
 *   .ofd  GB/T 33190 container — a ZIP whose entries are XML (the invoice
 *         payload usually lives in OriginalInvoice.xml / invoice.xml)
 *
 * The exact XML schema varies between platforms and versions, so extraction
 * is deliberately tolerant: the tree is flattened to path→value leaves and
 * matched case-insensitively against English tag names (InvoiceNumber,
 * BuyerName, TotalAmount…) AND their pinyin/Chinese equivalents (fphm,
 * 价税合计). Whatever is not found by tags falls back to the label-regex
 * extractor over the raw text (labels appear as values in several variants).
 */

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  parseTagValue: false,
  trimValues: true,
});

interface Leaf {
  path: string; // lower-cased dotted path, e.g. invoice.buyerinfo.buyername
  value: string;
}

function flatten(node: unknown, prefix: string, out: Leaf[], depth = 0): void {
  if (depth > 12 || node == null) return;
  if (typeof node === "object" && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k.startsWith("@")) continue; // attributes rarely carry the fields
      flatten(v, prefix ? `${prefix}.${k}` : k, out, depth + 1);
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) flatten(item, prefix, out, depth + 1);
    return;
  }
  const value = String(node).trim();
  if (value) out.push({ path: prefix.toLowerCase(), value });
}

const normAmount = (v: string): number | null => {
  const n = parseFloat(v.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const normDate = (v: string): string | null => {
  const d = v.replace(/[.\-/]/g, "");
  // 20241231 / 20241231123045 → YYYY-MM-DD; ISO strings pass through.
  const m = d.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m?.[1] && m[2] && m[3]) return `${m[1]}-${m[2]}-${m[3]}`;
  const iso = v.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso?.[1] ?? null;
};

/** True when the leaf sits on the BUYER side (path or value context). */
const isBuyer = (l: Leaf) =>
  /buyer|purchase|gmf|购.*方|买方/.test(l.path) || /^购买方/.test(l.value);

function fieldsFromLeaves(leaves: Leaf[]): Partial<InvoiceFields> {
  const pick = (pred: (l: Leaf) => boolean): Leaf | undefined =>
    leaves.find(pred);

  const out: Partial<InvoiceFields> = {};

  const nameLeaf =
    pick((l) => isBuyer(l) && /(?:buyer)?(?:name|title|mc)$/.test(l.path)) ??
    pick((l) => /buyername|gmfmc|购买方名/.test(l.path)) ??
    pick((l) => /^购买方名\s*称[:：]?\s*\S/.test(l.value));
  if (nameLeaf) {
    const m = nameLeaf.value.match(/(?:名称|抬头)[:：]?\s*(.+)$/);
    out.title = (m?.[1] ?? nameLeaf.value).trim();
  }

  const taxLeaf =
    pick(
      (l) =>
        isBuyer(l) &&
        /(?:taxid|taxno|nsrsbh|gmfsbh|sbh|identification)$/.test(l.path),
    ) ??
    pick((l) => /纳税人识别号|统一社会信用/.test(l.value) && isBuyer(l)) ??
    pick((l) => /(?:nsrsbh|gmfsbh|taxregistration)/.test(l.path));
  if (taxLeaf) {
    const m = taxLeaf.value.match(/([0-9A-HJ-NPQRTUWXY]{15,20})/);
    if (m) out.taxId = m[1];
  }

  const amountLeaf =
    pick((l) =>
      /pricetaxtotal|totalamountandtax|grandtotal|jshj|价税合计/.test(l.path),
    ) ?? pick((l) => /^价税合计|^[（(]小写/.test(l.value));
  if (amountLeaf) {
    const m = amountLeaf.value.match(
      /[¥￥]?\s*([0-9]+(?:,?[0-9]{3})*\.[0-9]{2})/,
    );
    if (m?.[1]) out.amount = normAmount(m[1]);
  }

  const noLeaf = pick((l) =>
    /invoicenumber|invoiceno|fphm|发票号码/.test(l.path),
  );
  if (noLeaf) {
    const m = noLeaf.value.match(/\d{8}|\d{20}/);
    if (m) out.invoiceNo = m[0];
  }

  const dateLeaf = pick((l) =>
    /issuedate|invoicedate|kprq|开票日期/.test(l.path),
  );
  if (dateLeaf) out.issueDate = normDate(dateLeaf.value);

  return out;
}

function parseXmlBuffer(buf: Buffer): {
  fields: Partial<InvoiceFields>;
  text: string;
} {
  const text = buf.toString("utf8");
  const leaves: Leaf[] = [];
  try {
    const tree = xml.parse(text);
    flatten(tree, "", leaves);
  } catch {
    // malformed XML → regex fallback below
  }
  const fields = fieldsFromLeaves(leaves);
  // Fallback / gap-fill with the label-regex extractor over the raw text.
  const re = extractInvoiceFields(text);
  return {
    fields: {
      title: fields.title ?? re.title,
      taxId: fields.taxId ?? re.taxId,
      amount: fields.amount ?? re.amount,
      invoiceNo: fields.invoiceNo ?? re.invoiceNo,
      issueDate: fields.issueDate ?? re.issueDate,
      checkCode: re.checkCode,
      invoiceCode: re.invoiceCode,
    },
    text,
  };
}

/** Extract the embedded invoice XML from an OFD container (ZIP of XMLs). */
function ofdXmlBuffers(buf: Buffer): Buffer[] {
  const zip = new AdmZip(buf);
  const entries = zip
    .getEntries()
    .filter((e) => !e.isDirectory && /\.xml$/i.test(e.entryName));
  // Prefer the invoice payload over scaffolding (Doc.xml etc.).
  entries.sort((a, b) => {
    const score = (n: string) =>
      /original.*invoice|invoice.*\.xml/i.test(n)
        ? 0
        : /attachment/i.test(n)
          ? 1
          : 2;
    return score(a.entryName) - score(b.entryName);
  });
  return entries.slice(0, 3).map((e) => e.getData());
}

export interface EInvoiceParseResult {
  fields: InvoiceFields;
  /** Human-readable dump for the invoice text preview + raw fallback. */
  rawText: string;
}

export function parseElectronicInvoice(
  buf: Buffer,
  ext: "xml" | "ofd",
): EInvoiceParseResult | null {
  const xmls =
    ext === "xml"
      ? [buf]
      : (() => {
          try {
            return ofdXmlBuffers(buf);
          } catch {
            return [];
          }
        })();
  if (!xmls.length) return null;

  // Merge fields across candidate XMLs (first non-null wins per field).
  const merged: Partial<InvoiceFields> = {};
  let combinedText = "";
  for (const b of xmls) {
    const { fields, text } = parseXmlBuffer(b);
    combinedText += text + "\n";
    for (const [k, v] of Object.entries(fields)) {
      if (v != null && (merged as Record<string, unknown>)[k] == null) {
        (merged as Record<string, unknown>)[k] = v;
      }
    }
  }
  const f: InvoiceFields = {
    title: merged.title ?? null,
    taxId: merged.taxId ?? null,
    amount: merged.amount ?? null,
    invoiceNo: merged.invoiceNo ?? null,
    issueDate: merged.issueDate ?? null,
    checkCode: merged.checkCode ?? null,
    invoiceCode: merged.invoiceCode ?? null,
    raw: combinedText,
  };
  // A file with none of the core fields is not an invoice → let the caller
  // mark it for manual review.
  if (!f.title && !f.taxId && f.amount == null) return null;

  const lines = [
    f.title ? `购买方：${f.title}` : null,
    f.taxId ? `纳税人识别号：${f.taxId}` : null,
    f.invoiceNo ? `发票号码：${f.invoiceNo}` : null,
    f.issueDate ? `开票日期：${f.issueDate}` : null,
    f.amount != null ? `价税合计：¥${f.amount.toFixed(2)}` : null,
  ].filter(Boolean);
  const rawText = `【数电票 · 结构化解析】\n${lines.join("\n")}\n\n${combinedText.slice(0, 12000)}`;
  return { fields: f, rawText };
}
