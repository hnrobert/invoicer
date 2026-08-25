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
const TAX_ID_18 =
  /(?<![0-9A-HJ-NPQRTUWXY])[0-9A-HJ-NPQRTUWXY]{18}(?![0-9A-HJ-NPQRTUWXY])/;
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
  /** SELLER name (pairing key: receipt.merchant ↔ invoice.seller). */
  seller: string | null;
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
      // 数电票 label-block layouts make these regexes catch header words
      // ("项目名称"…); a label-only capture is garbage — skip it so the
      // positional fallback below can run.
      const garbage =
        /^(?:[\s:：]*(?:项目名称|名称|购买方|销售方|信息|开票人|收款人|复核|备注|合计|价税合计.*|（?小写）?|大写|规格型号|单位|数量|单价|金额|税率(?:\/征收率)?|税额)[\s:：]*)+$/u;
      if (full.length >= 2 && !garbage.test(full)) title = full;
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

  // --- positional fallback (数电票 layouts that separate labels from values)
  // Text-based e-invoice PDFs often emit the label block first and the value
  // stream later (sometimes with the buyer/seller names concatenated). When
  // the label-adjacent regexes found no title, pair values positionally:
  //   1. tax ids = standalone 18-char tokens (boundaries exclude the 20-digit
  //      invoice number),
  //   2. names = CJK runs that aren't label words (splitting a joined
  //      "公司A公司B" run at the first company suffix when two taxes exist),
  //   3. buyer = first or second pair depending on which label block
  //      (购买/销售) appears first in the text.
  let seller: string | null = null;
  if (!title) {
    const pos = positionalFields(raw);
    if (pos) {
      title = pos.title;
      seller = pos.seller;
      if (pos.taxId) taxId = pos.taxId;
    }
  }

  return {
    title,
    taxId,
    seller,
    amount,
    invoiceNo: no?.[1] ?? null,
    issueDate,
    checkCode: check ? check[1]!.replace(/\s+/g, "") : null,
    invoiceCode: code?.[1] ?? null,
    raw,
  };
}

/** Label words that must never be mistaken for a party name. */
const NAME_LABEL_RE =
  /(名称|购买|销售|项目|备注|开票人|收款人|复核|密码|规格|型号|单位|数量|单价|金额|税率|税额|合计|价税|大写|小写|统一社会信用|纳税人|识别号|发票|日期|电子|普通|专用|号码|机器|编号|校验码|银行|账号|地址|电话|品目)/;

/**
 * Standalone tax-id tokens in text order. Handles both separated tokens
 * ("…XG" alone) AND concatenated buyer+seller runs ("…R…XG", a 36-char
 * stream sliced into 18-char halves); non-multiple runs (e.g. the 20-digit
 * invoice number) are rejected wholesale.
 */
function scanTaxTokens(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/[0-9A-HJ-NPQRTUWXY]{18,}/g)) {
    const run = m[0];
    if (run.length % 18 === 0) {
      for (let i = 0; i < run.length; i += 18) out.push(run.slice(i, i + 18));
    }
  }
  return out;
}

function splitJoinedName(joined: string): [string, string] | null {
  const m = joined.match(
    /^(.{3,25}?(?:有限公司|有限责任公司|股份有限公司|（普通合伙）|（有限合伙）|大学|学院|研究院|研究中心|事务所|工作室|商店|商场|厂|集团))(.{3,25})$/u,
  );
  return m ? [m[1]!, m[2]!] : null;
}

function positionalFields(
  text: string,
): { title: string; taxId: string; seller: string | null } | null {
  const taxes = scanTaxTokens(text);
  if (!taxes.length) return null;

  // CJK party-name candidates: label words excluded, and runs inside
  // asterisk-wrapped item names ("*其他机械设备*电器…") dropped — those are
  // line items, not parties.
  let names = [...text.matchAll(/[\u4e00-\u9fff（）()]{4,30}/gu)]
    .filter(
      (m) => text[m.index - 1] !== "*" && text[m.index + m[0].length] !== "*",
    )
    .map((m) => m[0])
    .filter((x) => !NAME_LABEL_RE.test(x));

  // Joined buyer+seller name run ("…公司A公司B") → split at the first
  // company suffix; the split parts are the two parties in value order.
  if (taxes.length >= 2 && names.length) {
    const split = splitJoinedName(names[0]!);
    if (split) names = split;
  }
  if (!names.length) return null;

  // Which party block leads the label section decides value order.
  const buyIdx = text.indexOf("购");
  const sellIdx = text.indexOf("销");
  const buyerFirst = buyIdx >= 0 && (sellIdx < 0 || buyIdx < sellIdx);

  const bi = buyerFirst ? 0 : 1;
  const si = 1 - bi;
  const name = names[bi] as string | undefined;
  const seller = (names[si] as string | undefined) ?? null;
  const tax = taxes[bi] ?? taxes[0]!;
  if (!name) return null;
  return { title: name, taxId: tax, seller };
}
