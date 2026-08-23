// Field extraction ported from the original Python ocr_service.py, extended
// with patterns from the open-source Chinese-invoice scanners sanluan/einvoice
// (Java) and mvpboss1004/invoice_extraction (Python). Pulls the buyer title
// (抬头), tax id (纳税人识别号/统一社会信用代码), the 价税合计/小写 amount, plus
// invoice number / issue date / check code (legacy 税控 invoices).

const TITLE_END =
  "(?:\\s*$|\\n|\\r|纳税人识别号|统一社会信用|税\\s*号|开票日期|密码区|规格型号|金额|税率|地址|电话|开户行|账号)";

const TITLE_PATTERNS: RegExp[] = [
  /购买方名\s*称[:：]?\s*([^\n/]+?)\//,
  /名\s*称[:：]?\s*([^\n/]+?)\//,
  new RegExp("购买方名\\s*称[:：]?\\s*(.+?" + TITLE_END + ")", "m"),
  new RegExp("名\\s*称[:：]\\s*(.+?" + TITLE_END + ")", "m"),
  new RegExp("抬头[:：]\\s*(.+?" + TITLE_END + ")", "m"),
];
const TITLE_CLEAN =
  /\/|纳税人识别号|统一社会信用|税\s*号|开票日期|密码区|规格型号|金额|税率|地址|电话|开户行|账号/;

const TAX_ID_LABELED =
  /(?:纳税人识别号|统一社会信用代码|税号)[:：]?\s*([0-9A-HJ-NPQRTUWXY]{15,20})/;
const TAX_ID_18 = /[0-9A-HJ-NPQRTUWXY]{18}/;
const TAX_ID_NUM = /\b\d{15,20}\b/;

const AMOUNT_PATTERNS: RegExp[] = [
  /价税合计[^0-9¥￥]*[¥￥]?\s*([0-9]+(?:,?[0-9]{3})*\.[0-9]{2})/,
  /小写[^0-9¥￥]*[¥￥]?\s*([0-9]+(?:,?[0-9]{3})*\.[0-9]{2})/,
];
const AMOUNT_FALLBACK = /[¥￥]\s*([0-9]+(?:,?[0-9]{3})*\.[0-9]{2})/g;

// Ported from sanluan/einvoice + mvpboss1004/invoice_extraction:
//   invoice no: 20 digits (数电票) or 8 digits (legacy 税控)
//   issue date: 2024年12月31日 (spaces tolerated between digits)
//   check code: 20 digits, often printed with spaces
//   invoice code (legacy only): 10-12 digits
const INVOICE_NO = /发票号码\s*[:：]?\s*(\d{8}|\d{20})(?!\d)/;
const ISSUE_DATE =
  /开票日期\s*[:：]?\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/;
const CHECK_CODE = /校验码\s*[:：]?\s*([0-9 ]{20,29})/;
const INVOICE_CODE = /发票代码\s*[:：]?\s*(\d{10,12})(?!\d)/;

export interface InvoiceFields {
  title: string | null;
  taxId: string | null;
  amount: number | null;
  /** 发票号码 — 20 digits for 数电票, 8 for legacy tax-control invoices. */
  invoiceNo: string | null;
  /** 开票日期 as YYYY-MM-DD. */
  issueDate: string | null;
  /** 校验码 (legacy invoices; whitespace stripped). */
  checkCode: string | null;
  /** 发票代码 (legacy tax-control invoices only). */
  invoiceCode: string | null;
  raw: string;
}

export function extractInvoiceFields(text: string): InvoiceFields {
  const raw = text;

  // --- title ---
  let title: string | null = null;
  for (const pat of TITLE_PATTERNS) {
    const m = raw.match(pat);
    if (m) {
      // group 1 is guaranteed by every TITLE_PATTERN
      const full = (m[1]!.split(TITLE_CLEAN)[0] ?? "")
        .trim()
        .replace(/[\s:：\t]+$/, "");
      if (full.length >= 2) title = full;
      break;
    }
  }

  // --- tax id ---
  let taxId: string | null = null;
  let m = raw.match(TAX_ID_LABELED);
  if (!m) m = raw.match(TAX_ID_18);
  if (!m) m = raw.match(TAX_ID_NUM);
  if (m) taxId = m[1] ?? m[0];

  // --- amount (价税合计 > 小写 > last ¥ amount) ---
  let amount: number | null = null;
  for (const pat of AMOUNT_PATTERNS) {
    const mm = raw.match(pat);
    if (mm) {
      amount = parseFloat(mm[1]!.replace(/,/g, ""));
      break;
    }
  }
  if (amount == null) {
    const all = [...raw.matchAll(AMOUNT_FALLBACK)].map((x) => x[1]!);
    const last = all[all.length - 1];
    if (last) amount = parseFloat(last.replace(/,/g, ""));
  }

  // --- metadata (display only; no effect on matching) ---
  const no = raw.match(INVOICE_NO);
  const date = raw.match(ISSUE_DATE);
  const check = raw.match(CHECK_CODE);
  const code = raw.match(INVOICE_CODE);
  const issueDate = date
    ? `${date[1]}-${date[2]!.padStart(2, "0")}-${date[3]!.padStart(2, "0")}`
    : null;

  return {
    title,
    taxId,
    amount,
    invoiceNo: no?.[1] ?? null,
    issueDate,
    checkCode: check ? check[1]!.replace(/\s+/g, "") : null,
    invoiceCode: code?.[1] ?? null,
    raw,
  };
}
