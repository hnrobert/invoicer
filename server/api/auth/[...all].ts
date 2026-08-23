import type { H3Event } from "h3";
import { auth } from "#server/utils/auth";
import { findEmailOwner, primaryForLogin } from "#server/utils/emails";
import { ensureBootstrapAdmin } from "#server/utils/superadmin";

// Mounts the Better Auth handler under /api/auth/* (sign-in, sign-up, sign-out,
// get-session, OAuth callbacks). better-auth owns all sub-paths — except the
// two credential endpoints we intercept for the multi-email model:
//   - sign-up/email: the "already-registered reminder" step — if the email is already linked to
//     ANY account (primary or secondary), reject with guidance instead of a raw
//     duplicate error (mirrors the OAuth account_not_linked flow).
//   - sign-in/email: signing in with a linked SECONDARY email maps to the
//     account's primary before better-auth sees it.
// Intercepted requests have their body re-serialized into a fresh Request —
// reading the body here drains the original stream, so toWebRequest(event)
// must NOT be used afterwards on these paths.
/**
 * Better Auth resolves the rate-limit client IP from HEADERS ONLY (default:
 * x-forwarded-for) — a web Request carries no socket info, so without this
 * the limiter degrades to one shared per-path bucket in production.
 *
 *   TRUST_PROXY unset (default, direct exposure): OVERWRITE x-forwarded-for
 *     with the socket's remote address — clients cannot spoof it (a direct
 *     peer sending its own XFF gets it replaced).
 *   TRUST_PROXY=1 (behind nginx/caddy): KEEP the incoming XFF chain; the
 *     proxy is responsible for setting the real client IP.
 */
function stampClientIp(event: H3Event): void {
  const remote =
    (event.node?.req as { socket?: { remoteAddress?: string } } | undefined)
      ?.socket?.remoteAddress ?? "";
  const incoming = event.headers.get("x-forwarded-for");
  if (process.env.TRUST_PROXY && incoming) return;
  if (remote) event.headers.set("x-forwarded-for", remote);
}

export default defineEventHandler(async (event) => {
  stampClientIp(event);
  // NOTE: event.path includes the query string — strip it before matching.
  const path = event.path.replace(/^.*\/api\/auth/, "").split("?")[0];
  const isSignUp = event.method === "POST" && path === "/sign-up/email";
  const isSignIn = event.method === "POST" && path === "/sign-in/email";

  // Better Auth's OAuth failures land on its own bare HTML page at
  // /api/auth/error — invisible to the app. Redirect them to our friendly
  // OAuth return page instead so the user sees a proper message.
  if (event.method === "GET" && path === "/error") {
    const code = getQuery(event).error?.toString() || "unknown";
    return sendRedirect(
      event,
      `/oauth/callback?error=${encodeURIComponent(code)}`,
    );
  }

  if (!isSignUp && !isSignIn) {
    return auth.handler(toWebRequest(event));
  }

  const raw = (await readBody<Record<string, unknown>>(event).catch(
    () => ({}),
  )) as Record<string, unknown> & { email?: unknown };
  const email =
    typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";

  if (isSignUp) {
    // Username policy: letters (both cases), digits, hyphen, underscore only.
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!/^[A-Za-z0-9_-]{1,39}$/.test(name)) {
      throw createError({
        statusCode: 400,
        message:
          "Username may only contain letters (a-z, A-Z), digits, - and _ (1-39 characters).",
      });
    }
  }

  if (isSignUp && email) {
    const owner = await findEmailOwner(email);
    if (owner) {
      // Reminder step: guide to the existing account instead of a raw
      // duplicate error. `message` (not statusMessage) — h3 sanitizes long
      // statusMessages, and the client's messageFromError reads it.
      throw createError({
        statusCode: 409,
        message:
          "This email is already linked to an account. Sign in to that account (reset the password if needed), or use a different email for a new account.",
      });
    }
  }
  if (isSignIn && email) {
    const primary = await primaryForLogin(email);
    if (primary) raw.email = primary;
  }

  const headers = new Headers(getHeaders(event) as Record<string, string>);
  const req = new Request(toWebRequest(event).url, {
    method: "POST",
    headers,
    body: JSON.stringify(raw),
  });
  const res = await auth.handler(req);
  // The site's first sign-up decides the bootstrap superadmin — grant at
  // registration time, AWAITED so the row is committed before the response
  // returns (the client's immediate /api/me must already see it).
  if (isSignUp && res.ok) await ensureBootstrapAdmin();
  return res;
});
