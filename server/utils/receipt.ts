import type { InvoiceFields } from "./fields";

/**
 * Receipt / order-screenshot field extraction over OCR text. Unlike formal
 * invoices these have no tax-id structure — the useful fields are the paid
 * amount, the merchant/shop, the order number and the date. Designed as the
 * pairing key for the upcoming receipt↔invoice correspondence mode:
 * receipt.merchant ↔ invoice SELLER + amount equality is the join.
 */

export interface ReceiptFields {
  kind: "invoice" | "receipt";
  merchant: string | null;
  orderNo: string | null;
  amount: number | null;
  date: string | null;
}

/** Formal-invoice markers (any hit strongly implies kind = invoice). */
const INVOICE_MARKERS = [
  "发票号码",
  "发票代码",
  "价税合计",
  "校验码",
  "增值税",
  "电子发票",
  "普通发票",
  "专用发票",
  "纳税人识别号",
  "统一社会信用代码",
  "机器编号",
];
/** Receipt / order-screenshot markers. */
const RECEIPT_MARKERS = [
  "实付",
  "订单号",
  "订单编号",
  "交易单号",
  "商家",
  "店铺",
  "门店",
  "下单时间",
  "付款时间",
  "支付金额",
  "收银小票",
  "购物小票",
  "电子小票",
];

/** Score-based kind detection: whichever marker family dominates wins. */
/**
 * OCR output sprinkles spaces between CJK chars ("商 家 :") and occasionally
 * mis-reads simplified as traditional (技術/訂單). Normalize a COPY for
 * matching: strip inter-CJK whitespace and fold common traditional variants.
 */
// Kangxi-radical lookalikes PDF text layers often emit (⽉ instead of 月)
// folded to their CJK counterparts — label matching depends on it.
const RADICAL_MAP: Record<string, string> = {
  "⽤": "用",
  "⼊": "入",
  "⽇": "日",
  "⼈": "人",
  "⼿": "手",
  "⼀": "一",
  "⼆": "二",
  "⼋": "八",
  "⼗": "十",
  "⽅": "方",
  "⾦": "金",
  "⾏": "行",
  "⽀": "支",
  "⼝": "口",
  "⽂": "文",
  "⼴": "广",
  "⼭": "山",
  "⼼": "心",
  "⽉": "月",
  "⼤": "大",
  "⼩": "小",
  "⾼": "高",
  "⼚": "厂",
  "⻔": "门",
  "⻢": "马",
  "⻋": "车",
  "⾬": "雨",
  "⻄": "西",
  "⻉": "贝",
  "⻚": "页",
  "⾃": "自",
  "⽩": "白",
  "⽬": "目",
  "⽿": "耳",
  "⾂": "臣",
  "⽰": "示",
};

export function normalizeOcrText(text: string): string {
  return text
    .replace(/([\u4e00-\u9fff])[ \t]+(?=[\u4e00-\u9fff])/g, "$1")
    .replace(/技術/g, "技术")
    .replace(/訂單/g, "订单")
    .replace(/單號/g, "单号")
    .replace(/號/g, "号")
    .replace(/實付/g, "实付")
    .replace(/金額/g, "金额")
    .replace(/時間/g, "时间")
    .replace(/總計/g, "总计")
    .replace(/合計/g, "合计")
    .replace(/總額/g, "总额")
    .replace(
      /[⽤⼊⽇⼈⼿⼀⼆⼋⼗⽅⾦⾏⽀⼝⽂⼴⼭⼼⽉⼤⼩⾼⼲⻔⻢⻋⾬⻄⻉⻚⾃⽩⽬⽿⾂⽰]/gu,
      (ch) => RADICAL_MAP[ch] ?? ch,
    );
}

/**
 * Quotation / itemized-list markers. These sheets are SUPPORTING EVIDENCE for
 * an invoice, never invoices themselves — but their templates print empty
 * invoice-label scaffolding ("发票号码：" with no value), so they must be
 * checked BEFORE the invoice/receipt scoring.
 */
const QUOTATION_MARKERS = [
  "报价单",
  "项目清单",
  "外送清单",
  "活动清单",
  "费用清单",
  "送货清单",
  "运单明细",
];

export function detectKind(
  rawText: string,
): "invoice" | "receipt" | "quotation" {
  const text = normalizeOcrText(rawText);
  for (const m of QUOTATION_MARKERS) if (text.includes(m)) return "quotation";
  let inv = 0;
  let rec = 0;
  for (const m of INVOICE_MARKERS) if (text.includes(m)) inv++;
  for (const m of RECEIPT_MARKERS) if (text.includes(m)) rec++;
  // Receipt markers are noisier — weight the more specific ones.
  if (text.includes("实付")) rec += 2;
  if (text.includes("订单号") || text.includes("订单编号")) rec += 2;
  if (text.includes("价税合计")) inv += 2;
  return rec > inv ? "receipt" : "invoice";
}

const MERCHANT_PATTERNS: RegExp[] = [
  /(?:商家名称|商家|店铺名称|店铺|门店名称|门店|卖家|商户名)\s*[:：]\s*([^\n\r]{2,30})/,
  // Order screenshots often print the shop name as a standalone line above
  // the order block — take the longest CJK run NOT containing label words.
];
const ORDER_NO_PATTERNS: RegExp[] = [
  /(?:订单编号|订单号|交易单号|单号)\s*[:：]?\s*([A-Za-z0-9-]{6,40})/,
];
const AMOUNT_PATTERNS: RegExp[] = [
  // Meituan grand total: "实付总额 ￥8.4" must beat the item's unit-price
  // "实付￥7.9" printed above it.
  /实付总额\s*[,，;；:：]?\s*[¥￥Y半羊尘v#*]?\s*([0-9][0-9,oO\s]{0,10}[.,][0-9oO]{1,2}|[0-9]{2,7})/,
  // Sam's Club paper receipts: "实 付 合计 ; 39 ,3?" is THE grand total —
  // must beat the (post-coupon) bare "实 付 ， 33.37" line above it.
  /实付合计\s*[,，;；:：]?\s*[¥￥Y半羊尘v#*]?\s*([0-9][0-9,oO\s]{0,10}[.,][0-9oO]{1,2}|[0-9]{2,7})/,
  // Meituan PaddleOCR layout mirrors it: the total prints BEFORE the label
  // ("元￥205.9 合计 已优惠23.3元") — anchor on 合计 right after the amount.
  /[¥￥Y半羊尘v#*]?\s*([0-9][0-9,oO\s]{0,10}[.,][0-9oO]{1,2}|[0-9]{2,7})\s*元\s*合计/,
  // Meituan delivery orders: "合计 已 优惠 23.3 元 ¥205.9" — an optional
  // savings note sits between the label and the grand total.
  /合计\s*(?:已\s*优惠\s*[0-9.]+\s*元)?\s*[¥￥Y半羊尘v#*]?\s*([0-9][0-9,oO\s]{0,10}[.,][0-9oO]{1,2}|[0-9]{2,7})/,
  /实付款?金额?\s*[:：]?\s*[¥￥]?\s*([0-9]+(?:,?[0-9]{3})*\.[0-9]{2})/,
  /支付金额[:：]?\s*[¥￥]?\s*([0-9]+(?:,?[0-9]{3})*\.[0-9]{2})/,
  // SF waybill details ("发票总金额(元) 129.00" / "运单金额(元) 129.00") and
  // flight-order screenshots ("订单总金额␎￥640" — integer, no 实付 label).
  /(?:订单总金额|订单金额|运单金额|发票总金额|总金额)\s*(?:[（(]\s*元\s*[）)])?\s*[:：]?\s*[¥￥Y半羊尘v#*]?\s*([0-9][0-9,oO\s]{0,10}[.,][0-9oO]{1,2}|[0-9]{2,7})/,
  /(?:合计|总计|总额|实收)[:：]?\s*[¥￥]?\s*([0-9]+(?:,?[0-9]{3})*\.[0-9]{2})/,
  // 1688 / WeChat order screenshots (real-world OCR):
  //  - "总 实 付 半 3 1.00"  → label 总实付, ¥ misread as 半/羊/Y, digits
  //    split by spaces ("3 1.00" = 31.00), o/O misread for 0 ("380.o0")
  //  - "实 付 款 共 减 7.54 Y55.82" → an optional 共减X discount segment
  //    sits between the label and the ¥-total
  //  - "实 付 款 ¥780" → INTEGER totals (no .00) — the strict patterns above
  //    require two decimals and missed them entirely
  // 1688 order pages: the grand total reliably sits right before the
  // "共N种N件" summary chip ("130.00⏎共1种100件") — even when the 总实付
  // label itself got severed from its number by a line break.
  /([0-9][0-9,oO]{0,10}[.,][0-9oO]{2})\s*(?:\n|\s)*共[1一]种/,
  // "总实付 ¥1341.00" — MUST beat the bare 实付 below: item-detail pages
  // print "实付¥18.30" as the UNIT price label, which sits earlier in the
  // text than the grand total.
  /总实付\s*(?:共减[\s¥￥Y半羊站#*]{0,3}[0-9][0-9.]{0,8})?\s*[:：]?\s*[¥￥Y半羊尘v#*]?\s*([0-9][0-9,oO\s]{0,10}[.,][0-9oO]{1,2}|[0-9]{2,7})/,
  // "实付款 共减(站)80 ¥140" — the discount segment may carry OCR noise
  // characters (站/#) and its own ¥; the TOTAL sits AFTER it. Also tolerates
  // the ¥-less form "共减¥80  140" where only the total prints bare.
  /(?:实付款?|实付金额)\s*(?:共减[\s¥￥Y半羊站#*]{0,3}[0-9][0-9.]{0,8})?\s*[,，;；:：]?\s*[¥￥Y半羊尘v#*]?\s*([0-9][0-9,oO\s]{0,10}[.,][0-9oO]{1,2}|[0-9]{2,7})(?![\s\S]{0,150}总实付)/,
  // PaddleOCR layout variant: the total prints BEFORE the label —
  // "…官方立减 ￥140\n实付款\n共减￥80". Anchored on 实付款 right after the
  // amount so the pre-discount price (￥220 … 共1件) never matches.
  /[¥￥Y半羊尘v#*]\s*([0-9][0-9,oO\s]{0,10}[.,][0-9oO]{1,2}|[0-9]{2,7})\s*(?:\n|\s)*实付款/,
];

/** Tolerant numeric cleanup for the OCR amount above (spaces, o/O for 0). */
function parseOcrAmount(raw: string): number | null {
  const t = raw.replace(/[oO]/g, "0").replace(/\s+/g, "");
  // OCR commas are DECIMALS in this domain ("39 ,3" = 39.3); a true
  // thousands separator matches the strict 1-3-3 grouping below.
  let m = t.match(/^([0-9]+)[.,，]([0-9]{1,2})$/);
  if (m) return Number(`${m[1]}.${m[2]}`);
  m = t.match(/^([0-9]+)(?:[.,，]([0-9]{1,2}))?$/);
  if (m) return m[2] ? Number(`${m[1]}.${m[2]}`) : Number(m[1]);
  if (/^[0-9]{1,3}(,[0-9]{3})+$/.test(t)) return Number(t.replace(/,/g, ""));
  return null;
}
const AMOUNT_FALLBACK = /[¥￥]\s*([0-9]+(?:,?[0-9]{3})*\.[0-9]{2})/g;
const DATE_PATTERNS: RegExp[] = [
  /(?:下单时间|付款时间|支付时间|交易时间|下单日期| creationTime)?\s*(20\d{2})[-/年.](\d{1,2})[-/月.](\d{1,2})/,
];

export function extractReceiptFields(rawText: string): ReceiptFields {
  const text = normalizeOcrText(rawText);
  const amount0 = (() => {
    for (const pat of AMOUNT_PATTERNS) {
      const m = text.match(pat);
      if (m?.[1]) {
        // parseOcrAmount first: parseFloat("3 1.00") would wrongly yield 3.
        const v = parseOcrAmount(m[1]) ?? parseFloat(m[1].replace(/,/g, ""));
        if (Number.isFinite(v)) return v;
      }
    }
    // 1688 item pages where the TOTAL got destroyed by OCR ("总实付D0.o0")
    // still print the unit price next to its quantity chip — "¥0.50 … x100".
    // unit × qty reconstructs the total; guards: a real ¥ decimal price and a
    // bounded quantity right after it.
    const uq = text.match(
      /[¥￥Y半羊尘v#*]\s*([0-9]{1,6}(?:[.,][0-9]{1,2})?)[\s\S]{0,80}?[x×]\s*([0-9]{1,5})(?![0-9.])/,
    );
    if (uq?.[1] && uq[2]) {
      const unit = parseOcrAmount(uq[1]);
      const qty = Number(uq[2]);
      if (unit != null && qty >= 2 && qty <= 100000)
        return Math.round(unit * qty * 100) / 100;
    }
    // Crumpled paper receipts: every total-line label may be OCR-destroyed,
    // but the grand total prints 2-3 times (subtotal / total / paid) while
    // any single line price appears once — the repeated decimal value IS the
    // total. Only fires when nothing labeled matched.
    const freq = new Map<string, number>();
    for (const m of text.matchAll(/([0-9]{1,6}[.,][0-9]{1,2})/g)) {
      const k = m[1]!;
      freq.set(k, (freq.get(k) ?? 0) + 1);
    }
    const repeated = [...freq.entries().filter(([, n]) => n >= 2)];
    if (repeated.length) {
      const best = repeated.sort(
        (a, b) =>
          b[1] - a[1] ||
          parseFloat(b[0].replace(/[.,](?=[0-9]{1,2}$)/, ".")) -
            parseFloat(a[0].replace(/[.,](?=[0-9]{1,2}$)/, ".")),
      )[0]!;
      const v = parseOcrAmount(best[0]);
      // floor ¥5 — repeated ¥1.00/¥0.50 price chips are line noise, not totals
      if (v != null && v >= 5) return v;
    }
    // No labeled total — fall back to the last ¥ amount in the image (user
    // rule: the 实付款-labeled total is the source of truth; unlabelled picks
    // are guesses, and "highest amount" would grab pre-discount line prices
    // like ¥220 on a ¥140 order).
    const all = [...text.matchAll(AMOUNT_FALLBACK)].map((x) => x[1]!);
    const last = all[all.length - 1];
    return last ? parseFloat(last.replace(/,/g, "")) : null;
  })();

  let merchant: string | null = null;
  for (const pat of MERCHANT_PATTERNS) {
    const m = text.match(pat);
    if (m?.[1]) {
      const v = m[1].trim();
      if (v.length >= 2) {
        merchant = v;
        break;
      }
    }
  }
  if (!merchant) {
    // Fallback: longest CJK run that is not a label word / common chrome.
    const noise =
      /(订单|金额|时间|合计|实付|支付|优惠|红包|积分|会员|地址|电话|收货|退款|售后|客服|评价|确认|收银|小票|欢迎|光临|谢谢|惠顾|请|收|共计|商品|数量|单价|备注)/;
    const runs = [...text.matchAll(/[一-鿿（）()A-Za-z0-9·]{3,25}/gu)]
      .map((m) => m[0])
      .filter((x) => !noise.test(x) && /[一-鿿]/.test(x));
    if (runs.length) merchant = runs.sort((a, b) => b.length - a.length)[0]!;
  }

  let orderNo: string | null = null;
  for (const pat of ORDER_NO_PATTERNS) {
    const m = text.match(pat);
    if (m?.[1]) {
      orderNo = m[1];
      break;
    }
  }

  let date: string | null = null;
  for (const pat of DATE_PATTERNS) {
    const m = text.match(pat);
    if (m?.[1] && m[2] && m[3]) {
      date = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
      break;
    }
  }

  return { kind: "receipt", merchant, orderNo, amount: amount0, date };
}

/** Adapter: reuse the invoice-fields amount logic for receipts. */
export function receiptFromInvoiceFields(f: InvoiceFields): ReceiptFields {
  return {
    kind: "receipt",
    merchant: null,
    orderNo: f.invoiceNo,
    amount: f.amount,
    date: f.issueDate,
  };
}
