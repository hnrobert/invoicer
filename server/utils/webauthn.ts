import { createHmac, timingSafeEqual } from "node:crypto";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";

/**
 * WebAuthn helpers for the passkey login flow (ported from the reference
 * project's verifier-gateway). The relying party is derived per-request so
 * passkeys work on localhost, HTTPS tunnels, and prod domains alike — the
 * credential is scoped to the host the visitor actually reached. Override via
 * WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN when a proxy makes the server's view of
 * its own host differ from the public origin.
 */

const CHALLENGE_COOKIE = "invoicer_pk_challenge";
const CHALLENGE_TTL_S = 5 * 60; // 5 min — generous for an authenticator prompt
const RP_NAME = "Invoicer";

export interface RelyingParty {
  rpID: string;
  rpName: string;
  origin: string;
}

/** Cookie-write descriptor (consumed by the passkey plugin's ctx.setCookie). */
export interface CookieSpec {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    sameSite: "lax";
    path: "/";
    maxAge: number;
    secure: boolean;
  };
}

interface CtxLike {
  headers: unknown;
  setCookie: (name: string, value: string, opts: CookieSpec["options"]) => void;
}

function header(ctx: CtxLike, name: string): string {
  const h = ctx.headers as
    { get?: (k: string) => string | null } | Record<string, string> | undefined;
  if (!h) return "";
  if (typeof h.get === "function") return h.get(name) ?? "";
  const key = name.toLowerCase();
  const rec = h as Record<string, string>;
  return rec[key] ?? rec[name] ?? "";
}

/** True when the request reached us over HTTPS (directly or via a proxy). */
function isSecure(ctx: CtxLike): boolean {
  const xfp = header(ctx, "x-forwarded-proto")
    .split(",")[0]
    ?.trim()
    .toLowerCase();
  if (xfp) return xfp === "https";
  return false;
}

export function getRelyingParty(ctx: CtxLike): RelyingParty {
  const xfh = header(ctx, "x-forwarded-host").split(",")[0]?.trim();
  const hostHeader = header(ctx, "host");
  // host[:port] exactly as the browser reached us. The WebAuthn ORIGIN must
  // include the port (e.g. http://localhost:10752) — it's compared verbatim
  // against the authenticator response — while the RP ID is always port-less.
  const fullHost = xfh || hostHeader || "localhost";
  const rpID = process.env.WEBAUTHN_RP_ID || fullHost.replace(/:\d+$/, "");
  const origin =
    process.env.WEBAUTHN_ORIGIN ||
    `${isSecure(ctx) ? "https" : "http"}://${fullHost}`;
  return { rpID, rpName: RP_NAME, origin };
}

function getSecret(): string {
  return (
    process.env.BETTER_AUTH_SECRET ||
    process.env.SESSION_SECRET ||
    "invoicer-dev-secret"
  );
}

/** HMAC-sign a challenge so a tampered cookie is rejected: `<challenge>.<sig>`. */
function signChallenge(challenge: string): string {
  const sig = createHmac("sha256", getSecret()).update(challenge).digest("hex");
  return `${challenge}.${sig}`;
}

function cookieOptions(ctx: CtxLike): CookieSpec["options"] {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: CHALLENGE_TTL_S,
    secure: isSecure(ctx),
  };
}

/** Store the ceremony challenge in a short-lived signed cookie (stateless). */
export function setChallengeCookie(ctx: CtxLike, challenge: string): void {
  ctx.setCookie(CHALLENGE_COOKIE, signChallenge(challenge), cookieOptions(ctx));
}

/** Returns the stored challenge if the cookie signature verifies, else null. */
export function getChallengeCookie(ctx: CtxLike): string | null {
  const raw = header(ctx, "cookie")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${CHALLENGE_COOKIE}=`))
    ?.slice(CHALLENGE_COOKIE.length + 1);
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const challenge = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = createHmac("sha256", getSecret())
    .update(challenge)
    .digest("hex");
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b) ? challenge : null;
}

/** Always clear after a verify attempt (success or failure) — replay protection. */
export function clearChallengeCookie(ctx: CtxLike): void {
  ctx.setCookie(CHALLENGE_COOKIE, "", { ...cookieOptions(ctx), maxAge: 0 });
}

/** Parse the stored transports JSON back into the typed array (empty if invalid). */
export function parseTransports(
  stored: string | null,
): AuthenticatorTransportFuture[] {
  if (!stored) return [];
  try {
    const arr = JSON.parse(stored) as unknown;
    return Array.isArray(arr) ? (arr as AuthenticatorTransportFuture[]) : [];
  } catch {
    return [];
  }
}

/**
 * better-sqlite3 returns a Node `Buffer` for a blob column; SimpleWebAuthn
 * wants an `ArrayBuffer`-backed Uint8Array. Copying detaches it from any
 * larger shared buffer and satisfies the type.
 */
export function bufferToUint8(buf: Buffer): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(buf.byteLength);
  out.set(buf);
  return out;
}

/**
 * Stable WebAuthn userHandle (bytes) for a user id. The library rejects raw
 * string userIDs, so encode the id (better-auth's string ids work fine).
 */
export function webauthnUserId(userId: string): Uint8Array<ArrayBuffer> {
  const buf = Buffer.from(userId);
  const out = new Uint8Array(buf.byteLength);
  out.set(buf);
  return out;
}
