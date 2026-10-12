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
    .replace(/總額/g, "总额");
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
  /实付款?金额?\s*[:：]?\s*[¥￥]?\s*([0-9]+(?:,?[0-9]{3})*\.[0-9]{2})/,
  /支付金额[:：]?\s*[¥￥]?\s*([0-9]+(?:,?[0-9]{3})*\.[0-9]{2})/,
  /(?:合计|总计|总额|实收)[:：]?\s*[¥￥]?\s*([0-9]+(?:,?[0-9]{3})*\.[0-9]{2})/,
  // 1688 / WeChat order screenshots (real-world OCR):
  //  - "总 实 付 半 3 1.00"  → label 总实付, ¥ misread as 半/羊/Y, digits
  //    split by spaces ("3 1.00" = 31.00), o/O misread for 0 ("380.o0")
  //  - "实 付 款 共 减 7.54 Y55.82" → an optional 共减X discount segment
  //    sits between the label and the ¥-total
  //  - "实 付 款 ¥780" → INTEGER totals (no .00) — the strict patterns above
  //    require two decimals and missed them entirely
  // "实付款 共减(站)80 ¥140" — the discount segment may carry OCR noise
  // characters (站/#) and its own ¥; the TOTAL sits AFTER it. Also tolerates
  // the ¥-less form "共减¥80  140" where only the total prints bare.
  /(?:实付款?|总实付|实付金额)\s*(?:共减[\s¥￥Y半羊站#]{0,3}[0-9][0-9.]{0,8})?\s*[:：]?\s*[¥￥Y半羊#]?\s*([0-9][0-9,oO\s]{0,10}[.,][0-9oO]{2}|[0-9]{2,7})/,
  // PaddleOCR layout variant: the total prints BEFORE the label —
  // "…官方立减 ￥140\n实付款\n共减￥80". Anchored on 实付款 right after the
  // amount so the pre-discount price (￥220 … 共1件) never matches.
  /[¥￥Y半羊#]\s*([0-9][0-9,oO\s]{0,10}[.,][0-9oO]{2}|[0-9]{2,7})\s*(?:\n|\s)*实付款/,
];

/** Tolerant numeric cleanup for the OCR amount above (spaces, o/O for 0). */
function parseOcrAmount(raw: string): number | null {
  const t = raw.replace(/[oO]/g, "0").replace(/[\s,，]/g, "");
  const m = t.match(/^([0-9]+)(?:[.,]([0-9]{2}))?$/);
  if (!m) return null;
  return m[2] ? Number(`${m[1]}.${m[2]}`) : Number(m[1]);
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
    // No labeled total — fall back to the last ¥ amount in the image (user
    // rule: the 实付款-labeled total is the source of truth; unlabeled picks
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
