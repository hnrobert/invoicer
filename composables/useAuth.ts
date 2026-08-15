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

/**
 * The Better Auth session user arrives as JSON whose shape matches `AuthUser`
 * (id/name/email/emailVerified/image + ISO-string timestamps). Better Auth's own
 * types mark the timestamps as `Date`; we cast through `unknown` because the wire
 * payload is already serialized strings.
 */
function toAuthUser(u: unknown): AuthUser {
  return u as unknown as AuthUser;
}

/** A linked provider account (from Better Auth listAccounts). */
export interface LinkedAccount {
  id: string;
  providerId: string;
  accountId: string;
}

/** Reactive auth state + auth actions backed by Better Auth. */
export function useAuth() {
  const user = useState<AuthUser | null>("auth:user", () => null);
  /** Superadmin flag (SUPERADMIN_EMAILS) — gates the /admin surfaces. */
  const isAdmin = useState<boolean>("auth:isAdmin", () => false);

  async function signInEmail(email: string, password: string): Promise<void> {
    const { data, error } = await authClient().signIn.email({
      email,
      password,
    });
    if (error) throw new Error(error.message);
    if (data?.user) user.value = toAuthUser(data.user);
  }

  async function signUpEmail(
    name: string,
    email: string,
    password: string,
  ): Promise<void> {
    const { data, error } = await authClient().signUp.email({
      name,
      email,
      password,
    });
    if (error) throw new Error(error.message);
    if (data?.user) user.value = toAuthUser(data.user);
  }

  async function signOut(): Promise<void> {
    await authClient().signOut();
    user.value = null;
    await navigateTo("/login");
  }

  /**
   * Start an OAuth sign-in (redirects to the provider). After the Better Auth
   * callback, the browser lands back on `callbackURL`; the auth plugin then
   * hydrates the session on SSR load. For a trusted provider (github) whose
   * email matches an existing account, Better Auth auto-links (merges) it; a
   * blocked link redirects with `?error=account_not_linked`. WeChat (no email)
   * is matched by unionid/openid and creates/links accordingly.
   */
  async function signInSocial(
    provider: ProviderId,
    callbackURL: string = window.location.origin + "/",
  ): Promise<void> {
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
    callbackURL: string = window.location.origin + "/account",
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
          data?: Array<{ id: string; provider: string; accountId: string }>;
        }>;
      }
    ).listAccounts();
    return (res.data ?? []).map((a) => ({
      id: a.id,
      providerId: a.provider,
      accountId: a.accountId,
    }));
  }

  /** Re-read the session from the server (e.g. after an OAuth callback). */
  async function refreshUser(): Promise<void> {
    const res = await $fetch<{ user: AuthUser | null }>("/api/me");
    user.value = res.user;
  }

  return {
    user,
    isAdmin,
    signInEmail,
    signUpEmail,
    signOut,
    signInSocial,
    linkProvider,
    unlinkProvider,
    listAccounts,
    refreshUser,
  };
}
