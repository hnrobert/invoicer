// Field extraction ported from the original Python ocr_service.py, extended
// with patterns from the open-source Chinese-invoice scanners sanluan/einvoice
// (Java) and mvpboss1004/invoice_extraction (Python). Pulls the buyer title
// (抬头), tax id (纳税人识别号/统一社会信用代码), the 价税合计/小写 amount, plus
// invoice number / issue date / check code (legacy 税控 invoices).
//
// 数电票 PDF reality (verified against 54 real invoices, unpdf text): the
// label block (购 买 方 信 息 / 名称： …) and the VALUE STREAM come apart, and
// the value stream order is ALWAYS buyer→seller regardless of which label
// block leads (some layouts print the SELLER block first). So party pairing
// keys off the value stream, never off label order.

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
// Fallback-path garbage guard (only used when no tax id exists in the text).
// Space-tolerant, and CONTAINMENT-based (not full-match): label-block layouts
// make the label regexes swallow header fragments like "名称： 下载次数：1 合 计…".
const TITLE_GARBAGE_CONTAINS =
  /旅客\s*姓名|下载\s*次数|购买\s*方|销售\s*方|项目\s*名称|规格\s*型号|价税\s*合计|征收率|统一社会信用|纳税人识别号|发票号码|开票日期|电子发票|行程单/;

const TAX_ID_LABELED =
  /(?:纳税人识别号|统一社会信用代码|税号)[:：]?\s*([0-9A-HJ-NPQRTUWXY]{15,20})/;
// Bare-numeric fallback: unified credit codes are exactly 18 chars — wider
// ranges swallow 15/16-digit order numbers printed on receipt screenshots.
const TAX_ID_NUM = /\b\d{18}\b/;

// Uppercase-Chinese amount (价税合计大写) — in label/value-separated layouts
// it is the ONLY reliable anchor sitting right next to the decimal total
// ("贰佰捌拾捌圆整 ¥288.00"), and it always denotes the tax-inclusive total.
const CN_UPPER_AMT =
  /[壹贰叁肆伍陆柒捌玖拾佰仟万亿圆元整角分]{4,}[^0-9¥￥]{0,12}[¥￥]?\s*([0-9]+(?:,?[0-9]{3})*\.[0-9]{2})/;

const AMOUNT_PATTERNS: RegExp[] = [
  CN_UPPER_AMT,
  // Value stream puts the decimal total right next to its label:
  // "…价税合计（大写）¥叁佰玖拾肆圆玖角捌分 394.98(小写)" (reversed layouts
  // print the value BEFORE the label) or "（小写）¥581.20".
  /([0-9]+(?:,?[0-9]{3})*\.[0-9]{2})\s*[（(]\s*小写/,
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

  // --- parties: tax-id anchored pairing (primary path) ---
  // Any text carrying 18-char unified credit codes is a 数电票-style layout;
  // pair names/taxes off the VALUE STREAM (buyer always first there).
  let title: string | null = null;
  let seller: string | null = null;
  let taxId: string | null = null;
  const pos = positionalFields(raw);
  if (pos) {
    title = pos.title;
    seller = pos.seller;
    taxId = pos.taxId;
  }

  // Fallback title regexes only for texts with NO tax ids (legacy layouts
  // with adjacent label:value, plain OCR text, receipts).
  if (!taxId) {
    for (const pat of TITLE_PATTERNS) {
      const m = raw.match(pat);
      if (m) {
        // group 1 is guaranteed by every TITLE_PATTERN
        const full = (m[1]!.split(TITLE_CLEAN)[0] ?? "")
          .trim()
          .replace(/[\s:：\t]+$/, "");
        const clean = full.replace(/\s+/g, "");
        if (
          clean.length >= 2 &&
          !TITLE_GARBAGE_CONTAINS.test(clean) &&
          !NAME_LABEL_RE.test(clean)
        )
          title = full;
        break;
      }
    }
  }

  // Fallback tax id (label-adjacent or bare numeric) when no 18-char token.
  if (!taxId) {
    let m = raw.match(TAX_ID_LABELED);
    if (!m) m = raw.match(TAX_ID_NUM);
    if (m) taxId = m[1] ?? m[0];
  }

  // --- amount: uppercase-Chinese anchor > 价税合计 > 小写 > itinerary > ¥ ---
  let amount: number | null = null;
  for (const pat of AMOUNT_PATTERNS) {
    const mm = raw.match(pat);
    if (mm) {
      amount = parseFloat(mm[1]!.replace(/,/g, ""));
      break;
    }
  }
  if (amount == null) {
    // Air itinerary (行程单): decimal values are prefixed CNY and the
    // tax-inclusive total is the LAST one in the value row.
    const cnys = [
      ...raw.matchAll(/CNY\s*([0-9]+(?:,?[0-9]{3})*\.[0-9]{2})/g),
    ].map((x) => x[1]!);
    const lastCny = cnys[cnys.length - 1];
    if (lastCny) amount = parseFloat(lastCny.replace(/,/g, ""));
  }
  if (amount == null && /12306|95306/.test(raw)) {
    // Railway e-ticket (12306): labels are lost in the text layer and the
    // fare appears as a bare ": 25.00" — the first such colon-amount is it.
    const m = raw.match(/[:：]\s*([0-9]{1,6}(?:,?[0-9]{3})*\.[0-9]{2})/);
    if (m) amount = parseFloat(m[1]!.replace(/,/g, ""));
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
    seller,
    amount,
    invoiceNo: no?.[1] ?? null,
    issueDate,
    checkCode: check ? check[1]!.replace(/\s+/g, "") : null,
    invoiceCode: code?.[1] ?? null,
    raw,
  };
}

/** A run of uppercase-Chinese amount characters — that's a price, not a name. */
const CN_AMOUNT_RUN = /[壹贰叁肆伍陆柒捌玖拾佰仟万亿圆元整角分]{3,}/;

/** Label words that must never be mistaken for a party name. */
const NAME_LABEL_RE =
  /(名称|购买|销售|项目|备注|开票人|收款人|复核|密码|规格|型号|单位|数量|单价|金额|税率|税额|合计|价税|大写|小写|统一社会信用|纳税人|识别号|发票|日期|电子|普通|专用|号码|机器|编号|校验码|银行|账号|地址|电话|品目|旅客|姓名|下载|次数|标识|状态|国内|国际|行程|客票|承运|航班|座位|等级|时间|行李|票价|燃油|增值税|征收|基金|其他|税费|填开|网点|代号|验证|保险|提示|信息|税务|监制|总局|监制章|运输|服务|货物|牌号|起运地|到达地|工具|种类)/;

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

/**
 * Pair buyer/seller off the VALUE STREAM. The stream order is always
 * buyer→seller (verified across layouts where the label blocks swap):
 *   interleaved  "买名 买税 卖名 卖税"   (most 数电票 PDFs)
 *   grouped      "买税 卖税 … 买名 卖名" or "买名 卖名 … 买税 卖税"
 * With TWO tax ids both segments keep the same internal order, so index
 * pairing works; with ONE tax id (itineraries) the nearest preceding name
 * is the buyer. Returns null when the text has no tax id at all.
 */
function splitJoinedName(joined: string): [string, string] | null {
  const m = joined.match(
    /^(.{3,25}?(?:有限公司|有限责任公司|股份有限公司|（普通合伙）|（有限合伙）|大学|学院|研究院|研究中心|事务所|工作室|商店|商场|厂|集团))(.{3,25})$/u,
  );
  return m ? [m[1]!, m[2]!] : null;
}

function positionalFields(
  text: string,
): { title: string | null; taxId: string; seller: string | null } | null {
  const taxes = scanTaxTokens(text);
  if (!taxes.length) return null;

  // CJK party-name candidates with their positions; label words excluded and
  // runs inside asterisk-wrapped item names ("*其他机械设备*电器…") dropped —
  // those are line items, not parties. Joined buyer+seller runs (no space
  // between the two names in the text layer) are split at the first company
  // suffix so index pairing still sees two candidates.
  const names: { name: string; at: number }[] = [];
  for (const m of text.matchAll(/[一-鿿（）()]{4,40}/gu)) {
    if (text[m.index - 1] === "*" || text[m.index + m[0].length] === "*")
      continue;
    const run = m[0];
    if (NAME_LABEL_RE.test(run) || CN_AMOUNT_RUN.test(run)) continue;
    if (taxes.length >= 2 && run.length > 9) {
      const sp = splitJoinedName(run);
      if (sp) {
        names.push({ name: sp[0], at: m.index });
        names.push({ name: sp[1], at: m.index + sp[0].length });
        continue;
      }
    }
    names.push({ name: run, at: m.index });
  }

  let title: string | null = null;
  let seller: string | null = null;
  if (taxes.length >= 2 && names.length >= 2) {
    // Index pairing: both parties present in matching order.
    title = names[0]!.name;
    seller = names[1]!.name;
  } else if (names.length) {
    // Single tax id: nearest candidate (itineraries put the buyer name
    // right before the buyer tax id at the end of the stream).
    const taxAt = text.indexOf(taxes[0]!);
    let best: { name: string; dist: number } | null = null;
    for (const n of names) {
      const dist = Math.abs(n.at - taxAt);
      if (!best || dist < best.dist) best = { name: n.name, dist };
    }
    title = best!.name;
  }
  return { title, taxId: taxes[0]!, seller };
}
