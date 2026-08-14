// Field extraction ported from the original Python ocr_service.py. Pulls the
// buyer title (抬头), tax id (纳税人识别号/统一社会信用代码) and the 价税合计/小写
// amount out of the raw text/OCR result using the same regex strategy.

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

export interface InvoiceFields {
  title: string | null;
  taxId: string | null;
  amount: number | null;
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

  return { title, taxId, amount, raw };
}
