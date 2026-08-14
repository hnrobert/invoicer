import type { InvoiceFields } from "./fields";

export interface MatchResult {
  status: "qualified" | "review" | "unqualified";
  reason: string;
  titleOk: boolean;
  taxOk: boolean;
  amountInTotal: boolean;
}

/**
 * Decide an invoice's audit status from its extracted fields vs the expected
 * buyer title / tax id. Ported from the original Python `_match_invoice`.
 *
 * - title + tax id both match → qualified (counts toward total)
 * - partial match, or no amount recognized → review (human decides)
 * - neither matches → unqualified
 */
export function matchInvoice(
  extracted: InvoiceFields,
  expectedTitle: string,
  expectedTaxId: string | null,
): MatchResult {
  let titleOk = false;
  let taxOk = false;

  const exTitle = (extracted.title ?? "").trim();
  const exTax = (extracted.taxId ?? "").trim();

  // Title: containment either way, after stripping whitespace.
  if (exTitle && expectedTitle) {
    const a = exTitle.replace(/\s/g, "");
    const b = expectedTitle.replace(/\s/g, "");
    if (b && (b.includes(a) || a.includes(b))) titleOk = true;
  }
  // Tax id: exact match.
  if (exTax && expectedTaxId && exTax === expectedTaxId) taxOk = true;

  const amount = extracted.amount;
  let status: MatchResult["status"];
  let reason: string;

  if (titleOk && taxOk) {
    if (amount == null) {
      status = "review";
      reason = "抬头与税号匹配，但未识别到金额，请手动输入";
    } else {
      status = "qualified";
      reason = "抬头与税号均匹配";
    }
  } else if (titleOk || taxOk) {
    status = "review";
    if (titleOk && !taxOk) reason = "抬头匹配，税号不符";
    else if (taxOk && !titleOk) reason = "税号匹配，抬头不符";
    else reason = "部分信息匹配";
  } else {
    status = "unqualified";
    reason = "抬头与税号均不匹配";
  }

  return {
    status,
    reason,
    titleOk,
    taxOk,
    amountInTotal: status === "qualified",
  };
}
