import type { ProviderId } from "./useAuth";

/** Which OAuth providers are configured server-side (github / wechat). */
export interface OAuthProviders {
  github: boolean;
  wechat: boolean;
}

/**
 * Fetches the set of enabled OAuth providers once (shared across components via
 * useFetch's keyed cache). Used to render only the provider buttons that work.
 */
export function useOAuthProviders() {
  const { data } = useFetch<OAuthProviders>("/api/oauth-providers", {
    default: () => ({ github: false, wechat: false }),
  });
  const list = computed<ProviderId[]>(() => {
    const p = data.value;
    if (!p) return [];
    return (["github", "wechat"] as ProviderId[]).filter((k) => p[k]);
  });
  return { data, list };
}
