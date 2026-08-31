import type { MeResponse } from "#shared/api";
import type { AuthUser } from "#shared/types";
import { createAuthClient } from "better-auth/client";

/** The social provider ids we support (both built-in Better Auth providers). */
export type ProviderId = "github" | "wechat";

// Browser-only Better Auth client. Created lazily on first use so this module
// never touches `window` during SSR (the client manages its own cookies, so it
// is only meaningful in the browser — SSR hydration goes through /api/me).
let _client: ReturnType<typeof createAuthClient> | null = null;
/** Lazy singleton Better Auth client (browser-only). Email/password + OAuth. */
export function authClient() {
  if (!_client) _client = createAuthClient({ baseURL: window.location.origin });
  return _client;
}

/** A linked provider account (from Better Auth listAccounts). */
export interface LinkedAccount {
  id: string;
  providerId: string;
  accountId: string;
}

/** A registered passkey as shown in Settings → Security (safe fields only). */
export interface PasskeyInfo {
  id: number;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: string;
}

/** Reactive auth state + auth actions backed by Better Auth. */
export function useAuth() {
  const user = useState<AuthUser | null>("auth:user", () => null);
  /** Superadmin flag (SUPERADMIN_EMAILS) — gates the /admin surfaces. */
  const isAdmin = useState<boolean>("auth:isAdmin", () => false);

  async function signInEmail(email: string, password: string): Promise<void> {
    const { error } = await authClient().signIn.email({
      email,
      password,
    });
    if (error) throw new Error(error.message);
    // Re-read /api/me so user AND the superadmin flag are fresh (better-auth's
    // response knows nothing about isAdmin).
    await refreshUser();
  }

  async function signUpEmail(
    name: string,
    email: string,
    password: string,
  ): Promise<void> {
    const { error } = await authClient().signUp.email({
      name,
      email,
      password,
    });
    if (error) throw new Error(error.message);
    // The FIRST user to sign up is granted superadmin server-side before the
    // response returns — refresh immediately so isAdmin is live, not stale
    // until the next full page load.
    await refreshUser();
  }

  async function signOut(): Promise<void> {
    await authClient().signOut();
    user.value = null;
    await navigateTo("/login");
  }

  /**
   * Change the account password (requires the current one; email/password
   * accounts only — pure OAuth accounts have no password credential).
   */
  async function changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const { error } = await authClient().changePassword({
      currentPassword,
      newPassword,
    });
    if (error) throw new Error(error.message || "Password change failed");
  }

  /**
   * Start an OAuth sign-in (redirects to the provider). After the Better Auth
   * callback, the browser lands back on `callbackURL`; the auth plugin then
   * hydrates the session on SSR load. For a trusted provider (github) whose
   * email matches an existing account, Better Auth auto-links (merges) it; a
   * blocked link redirects with `?error=account_not_linked`. WeChat (no email)
   * is matched by unionid/openid and creates/links accordingly.
   */
  /**
   * Start a social sign-in. The provider returns to OUR landing page
   * (/oauth/callback) which refreshes the session, greets the user and
   * continues to `redirect` (a relative app path) — every OAuth outcome,
   * success or error, is visible there.
   */
  async function signInSocial(
    provider: ProviderId,
    redirect = "/",
  ): Promise<void> {
    const target = redirect.startsWith("/") ? redirect : "/";
    const callbackURL = `${window.location.origin}/oauth/callback?redirect=${encodeURIComponent(target)}`;
    // Both github and wechat are built-in providers, so signIn.social accepts
    // them; cast because the client's provider union isn't widened from server
    // config.
    await (
      authClient().signIn as unknown as {
        social: (p: {
          provider: string;
          callbackURL: string;
        }) => Promise<unknown>;
      }
    ).social({ provider, callbackURL });
  }

  /**
   * Link a provider to the CURRENTLY signed-in account — this is the supported
   * "merge into an existing account" path (Better Auth can't preserve an OAuth
   * identity across an interrupted sign-in, so merging is done while logged in).
   */
  async function linkProvider(
    provider: ProviderId,
    callbackURL: string = window.location.origin +
      "/oauth/callback?redirect=%2Fsettings%3Fsection%3Dsecurity",
  ): Promise<void> {
    await (
      authClient() as unknown as {
        linkSocial: (p: {
          provider: string;
          callbackURL: string;
        }) => Promise<unknown>;
      }
    ).linkSocial({ provider, callbackURL });
  }

  /** Remove a provider link from the current account. */
  async function unlinkProvider(providerId: ProviderId): Promise<void> {
    const { error } = await (
      authClient() as unknown as {
        unlinkAccount: (p: {
          providerId: string;
        }) => Promise<{ error?: { message?: string } | null }>;
      }
    ).unlinkAccount({ providerId });
    if (error) throw new Error(error.message ?? "unlink failed");
  }

  /** List the providers linked to the current account. */
  async function listAccounts(): Promise<LinkedAccount[]> {
    const res = await (
      authClient() as unknown as {
        listAccounts: () => Promise<{
          data?: Array<{
            id: string;
            provider?: string;
            providerId?: string;
            accountId: string;
          }>;
        }>;
      }
    ).listAccounts();
    // The wire shape uses `providerId` ("credential" for email+password).
    return (res.data ?? []).map((a) => ({
      id: a.id,
      providerId: a.providerId ?? a.provider ?? "",
      accountId: a.accountId,
    }));
  }

  /** Re-read the session from the server (e.g. after an OAuth callback). */
  async function refreshUser(): Promise<void> {
    const res = await $fetch<MeResponse>("/api/me");
    user.value = res.user;
    isAdmin.value = !!res.isAdmin;
  }

  // ---------- passkey (WebAuthn) ----------
  /** List the signed-in user's registered passkeys. */
  async function listPasskeys(): Promise<PasskeyInfo[]> {
    const res = await $fetch<{ passkeys: PasskeyInfo[] }>(
      "/api/auth/passkey/list",
    );
    return res.passkeys;
  }

  /** Register a new passkey for the signed-in account (browser prompt). */
  async function addPasskey(): Promise<PasskeyInfo[]> {
    const { startRegistration } = await import("@simplewebauthn/browser");
    const options = await $fetch<
      Parameters<typeof startRegistration>[0]["optionsJSON"]
    >("/api/auth/passkey/register-options");
    const response = await startRegistration({ optionsJSON: options });
    await $fetch("/api/auth/passkey/register-verify", {
      method: "POST",
      body: response,
    });
    return listPasskeys();
  }

  /** Remove one of the signed-in user's passkeys by id. */
  async function removePasskey(id: number): Promise<PasskeyInfo[]> {
    await $fetch("/api/auth/passkey/remove", {
      method: "POST",
      body: { id },
    });
    return listPasskeys();
  }

  /** Passwordless discoverable login (browser prompt) — refreshes the session. */
  async function loginWithPasskey(): Promise<void> {
    const { startAuthentication } = await import("@simplewebauthn/browser");
    const options = await $fetch<
      Parameters<typeof startAuthentication>[0]["optionsJSON"]
    >("/api/auth/passkey/login-options");
    const response = await startAuthentication({ optionsJSON: options });
    await $fetch("/api/auth/passkey/login-verify", {
      method: "POST",
      body: response,
    });
    // The verify call sets the better-auth session cookie; re-read it.
    await refreshUser();
  }

  return {
    user,
    isAdmin,
    listPasskeys,
    addPasskey,
    removePasskey,
    loginWithPasskey,
    signInEmail,
    signUpEmail,
    signOut,
    changePassword,
    signInSocial,
    linkProvider,
    unlinkProvider,
    listAccounts,
    refreshUser,
  };
}
