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
export interface AllowedTitle {
  title: string;
  taxId: string | null;
}

/**
 * Multi-title variant: the invoice qualifies when it matches ANY allowed
 * {title, taxId} pair (tax id exact, or title containment either way).
 */
export function matchInvoiceMulti(
  extracted: {
    title: string | null;
    taxId: string | null;
    amount?: number | null;
  },
  allowed: AllowedTitle[],
): MatchResult {
  let anyTitleOk = false;
  let anyTaxOk = false;
  const exTitle = (extracted.title ?? "").trim();
  const exTax = (extracted.taxId ?? "").trim();
  for (const a of allowed) {
    if (
      exTitle &&
      a.title &&
      a.title.replace(/\s/g, "") &&
      (a.title.replace(/\s/g, "").includes(exTitle.replace(/\s/g, "")) ||
        exTitle.replace(/\s/g, "").includes(a.title.replace(/s/g, "")))
    )
      anyTitleOk = true;
    if (exTax && a.taxId && exTax === a.taxId) anyTaxOk = true;
  }
  const amount = extracted.amount ?? null;
  let status: MatchResult["status"];
  let reason: string;
  if (anyTitleOk && anyTaxOk) {
    if (amount == null) {
      status = "review";
      reason =
        "Title and tax ID matched, but no amount recognized — enter it manually";
    } else {
      status = "qualified";
      reason = "Title and tax ID both matched";
    }
  } else if (anyTitleOk || anyTaxOk) {
    status = "review";
    reason = anyTitleOk
      ? "Title matched, tax ID mismatched"
      : "Tax ID matched, title mismatched";
  } else {
    status = "unqualified";
    reason = "Neither title nor tax ID matched";
  }
  return {
    status,
    reason,
    titleOk: anyTitleOk,
    taxOk: anyTaxOk,
    amountInTotal: status === "qualified",
  };
}

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
      reason =
        "Title and tax ID matched, but no amount recognized — enter it manually";
    } else {
      status = "qualified";
      reason = "Title and tax ID both matched";
    }
  } else if (titleOk || taxOk) {
    status = "review";
    if (titleOk && !taxOk) reason = "Title matched, tax ID mismatched";
    else if (taxOk && !titleOk) reason = "Tax ID matched, title mismatched";
    else reason = "Partial match";
  } else {
    status = "unqualified";
    reason = "Neither title nor tax ID matched";
  }

  return {
    status,
    reason,
    titleOk,
    taxOk,
    amountInTotal: status === "qualified",
  };
}
