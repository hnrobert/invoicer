import type { AuthUser } from "#shared/types";

// Hydrate the shared `auth:user` state on both server and client.
//
// SSR: forward the request cookie to /api/me so Better Auth resolves the
// session — this lets the global auth middleware run against a hydrated user
// before the page renders (no client-only flicker to /login).
// Client: the browser sends its own cookie automatically. OAuth outcomes are
// handled by the dedicated /oauth/callback landing page, not here.
export default defineNuxtPlugin(async () => {
  const user = useState<AuthUser | null>("auth:user", () => null);
  // Superadmin flag (site_admins table ∪ SUPERADMIN_EMAILS) — gates /settings
  // admin sections and the admin APIs.
  const isAdmin = useState<boolean>("auth:isAdmin", () => false);
  // Read the request context before the first await: Nuxt's active instance
  // isn't guaranteed to survive an await.
  const headers = useRequestHeaders(["cookie"]);
  try {
    const res = await $fetch<{ user: AuthUser | null; isAdmin?: boolean }>(
      "/api/me",
      {
        headers:
          import.meta.server && headers.cookie
            ? { cookie: headers.cookie }
            : undefined,
      },
    );
    user.value = res.user;
    isAdmin.value = !!res.isAdmin;
  } catch {
    user.value = null;
    isAdmin.value = false;
  }
});
