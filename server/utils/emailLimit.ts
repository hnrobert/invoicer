/**
 * Rate limiting for outbound transactional emails — two independent dimensions:
 *
 *  • Per-target (recipient address), per flow: 1/minute, {@link EMAIL_DAILY_LIMIT}/day.
 *    Applied to every user-initiated send (audit report, mail test) so one
 *    address can't be spammed. {@link checkEmailSend}
 *  • Per-account (the authenticated sender), aggregated across all flows they
 *    initiate: {@link ACCOUNT_PER_MINUTE}/min, {@link ACCOUNT_DAILY_LIMIT}/day.
 *    {@link checkAccountSend}
 *
 * The sliding-window engine lives in email-poster (`createEmailLimiter`); this
 * module binds it to the site's names and Chinese 429 wording. Each result
 * carries a `warning` string once the daily count approaches the cap
 * (per-target: >5, per-account: ≥20) so the caller can surface it.
 * In-memory, single-instance; counters are sliding windows of timestamps.
 */
import {
  createEmailLimiter,
  DEFAULT_EMAIL_DAILY_LIMIT,
  DEFAULT_ACCOUNT_PER_MINUTE,
  DEFAULT_ACCOUNT_DAILY_LIMIT,
  type EmailLimitResult,
} from "email-poster";

/** Per-target caps (1/min is the limiter's default; kept for parity/readability). */
export const EMAIL_DAILY_LIMIT = DEFAULT_EMAIL_DAILY_LIMIT;

/** Per-account caps. */
export const ACCOUNT_PER_MINUTE = DEFAULT_ACCOUNT_PER_MINUTE;
export const ACCOUNT_DAILY_LIMIT = DEFAULT_ACCOUNT_DAILY_LIMIT;

const limiter = createEmailLimiter();

/** Per-recipient cap for `flow` ('report' | 'test'). 1/min, 10/day. */
export function checkEmailSend(
  flow: string,
  email: string,
  now: Date = new Date(),
): EmailLimitResult {
  return limiter.checkTarget(flow, email, now);
}

/** Per-account cap (aggregated across flows). 6/min, 24/day; warn at ≥20/day. */
export function checkAccountSend(
  userId: number | string,
  now: Date = new Date(),
): EmailLimitResult {
  return limiter.checkAccount(userId, now);
}

/** Build the HTTP error for a blocked send (reads its own limit/scope). */
export function emailLimitError(r: EmailLimitResult): {
  statusCode: number;
  statusMessage: string;
} {
  const statusMessage =
    r.reason === "minute"
      ? `Sending too frequently — retry in ${r.retryInSeconds ?? 60}s`
      : r.scope === "address"
        ? `This email has hit its daily send limit (${r.dailyLimit}/day)`
        : `Your account has hit its daily send limit (${r.dailyLimit}/day)`;
  return { statusCode: 429, statusMessage };
}
