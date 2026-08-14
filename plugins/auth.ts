import type { AuthUser } from "#shared/types";

// Hydrate the shared `auth:user` state on both server and client.
//
// SSR: forward the request cookie to /api/me so Better Auth resolves the
// session — this lets the global auth middleware run against a hydrated user
// before the page renders (no client-only flicker to /login).
// Client: the browser sends its own cookie automatically. We also detect an
// OAuth `?error=account_not_linked` redirect here (Better Auth redirects with
// that query when a provider can't be auto-linked), show a friendly toast that
// guides the user to log in first and merge from Account settings, and strip
// the query param so it doesn't linger in the URL.
export default defineNuxtPlugin(async (nuxtApp) => {
  const user = useState<AuthUser | null>("auth:user", () => null);
  // Read the request context before the first await: Nuxt's active instance
  // isn't guaranteed to survive an await, and on the client this plugin only
  // runs once (initial load — exactly when an OAuth `?error=` query lands).
  const headers = useRequestHeaders(["cookie"]);
  const route = useRoute();
  try {
    const res = await $fetch<{ user: AuthUser | null }>("/api/me", {
      headers:
        import.meta.server && headers.cookie
          ? { cookie: headers.cookie }
          : undefined,
    });
    user.value = res.user;
  } catch {
    user.value = null;
  }

  if (import.meta.client) {
    const error = route.query.error;
    if (typeof error === "string" && error === "account_not_linked") {
      // NOTE: `useI18n()` cannot be used here — plugins run with no Vue
      // component instance, so vue-i18n throws "Must be called at the top of
      // a `setup` function". Use the i18n instance @nuxtjs/i18n injects on the
      // Nuxt app instead (it exposes the global composer's `t` directly).
      toast.error(nuxtApp.$i18n.t("auth.oauth.notLinked"));
      // Clear the error param from the URL without a full reload.
      navigateTo(
        { path: route.path, query: { ...route.query, error: undefined } },
        { replace: true },
      );
    }
  }
});
