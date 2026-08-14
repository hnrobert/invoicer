import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import Database from "better-sqlite3";

const githubId = process.env.GITHUB_CLIENT_ID;
const githubSecret = process.env.GITHUB_CLIENT_SECRET;
const wechatAppId = process.env.WECHAT_APP_ID;
const wechatAppSecret = process.env.WECHAT_APP_SECRET;

// Better Auth instance. This file is deliberately self-contained (no Nuxt
// aliases, no runtimeConfig) so the Better Auth CLI can load it directly to
// generate/migrate tables: `npx auth@latest migrate --config server/utils/auth.ts`.
//
// It opens a SECOND better-sqlite3 connection to the same SQLite file TypeORM
// uses. WAL is a per-file setting, so enabling it here lets both connections
// read/write concurrently (multiple readers + one writer) without "database is
// locked" under load.

const dbPath = process.env.DB_PATH || "./data/app.db";

// better-sqlite3 won't create the data directory itself.
mkdirSync(dirname(dbPath), { recursive: true });

/** better-auth's own connection — owns the user/session/account/verification tables. */
export const authDb = new Database(dbPath);
authDb.pragma("journal_mode = WAL");

export const auth = betterAuth({
  database: authDb,
  baseURL:
    process.env.BETTER_AUTH_URL ||
    process.env.SITE_URL ||
    "http://localhost:10752",
  // ≥32 chars required by better-auth. `BETTER_AUTH_SECRET` must be set in
  // production (see docker-compose.yml); the long default is dev-only.
  secret:
    process.env.BETTER_AUTH_SECRET ||
    "invoicer-dev-better-auth-secret-replace-in-prod-0123456789",
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: false, // self-hosted; no mail verification loop yet
    autoSignIn: true, // sign the user in immediately after sign-up
  },
  // OAuth providers — both GitHub and WeChat are built-in Better Auth providers
  // (callbacks at /api/auth/callback/<provider>). WeChat is non-standard OAuth2
  // (authorize needs `appid` not `client_id` + a `#wechat_redirect` fragment; the
  // token & userinfo endpoints are GET-based; no email is returned — identity is
  // the per-app openid / cross-app unionid), and Better Auth's built-in provider
  // handles all of that, so we use it directly rather than the genericOAuth
  // plugin. Each is only enabled when its credentials are present, so
  // dev/missing-config does not crash.
  socialProviders: {
    ...(githubId && githubSecret
      ? {
          github: {
            clientId: githubId,
            clientSecret: githubSecret,
            scope: ["user:email"],
          },
        }
      : {}),
    ...(wechatAppId && wechatAppSecret
      ? { wechat: { clientId: wechatAppId, clientSecret: wechatAppSecret } }
      : {}),
  },
  // Account linking — lets a user sign in via several providers tied to one
  // account record. `trustedProviders` lets GitHub/WeChat auto-link to an
  // existing user by shared email without a confirmation step; WeChat returns
  // NO email (identity is the per-app openid / cross-app unionid), so
  // `allowDifferentEmails` must be true to accept an email-less profile.
  accountLinking: {
    enabled: true,
    trustedProviders: ["github", "wechat"],
    allowDifferentEmails: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh the cookie once per day
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // trust the cookie for session reads up to 5 min
    },
  },
  // Trusted origins for the cross-origin OAuth/CSRF checks (added to in #15).
  trustedOrigins: [
    "http://localhost:10752",
    process.env.BETTER_AUTH_URL || "",
    process.env.SITE_URL || "",
  ].filter(Boolean),
  // Plugins:
  //   organization() — GitHub-like orgs: owner/admin/member roles, 48h
  //   invitations. Routes mount under /api/auth/organization/*.
  plugins: [
    organization({
      // Any registered user can create organizations (personal + org scope).
      allowUserToCreateOrganization: true,
      // Invitation links expire after 48 hours.
      invitationExpiresIn: 60 * 60 * 48,
      // We run without email verification (self-hosted, no SMTP verification
      // loop), so email-matched invitations must not require a verified email —
      // otherwise invitees can never see or accept their invitations.
      requireEmailVerificationOnInvitation: false,
      // Invitations are surfaced in the UI (pending invites list) rather than
      // emailed for now; wire this to the SMTP sender later.
      sendInvitationEmail: async () => {},
    }),
  ],
  // We deliberately do not run an email-verification loop. To keep the trust
  // model consistent and unblock email-gated Better Auth features (notably the
  // organization "pending invitations" list, which hard-requires emailVerified),
  // every newly created user is treated as verified. Remove this hook if/when
  // real email verification is wired up.
  databaseHooks: {
    user: {
      create: {
        before: async () => ({ data: { emailVerified: true } }),
      },
    },
  },
});

/** better-auth's inferred session user — used to type the client + API responses. */
export type SessionUser = typeof auth.$Infer.Session.user;
