import type { VisibilityResponse } from "#shared/api";
import type { OrgFull, OrgRole } from "#shared/types";

/**
 * Shared context for the /orgs/[slug]/* pages: resolves the org by slug from
 * the user's organization list (org pages are member-only — outsiders
 * discover public campaigns via the plaza), loads the full org (members,
 * invitations), the caller's role, and the org's platform visibility.
 *
 * The full org + visibility are cached per user+slug (useState — shared across
 * the org's sub-pages). Switching between the Campaigns / Members / Settings
 * tabs changes the ROUTE, remounting the page; without the cache every switch
 * would start at loading=true and flash the whole header block away. With it,
 * a cached context renders the header synchronously and load() merely
 * revalidates in the background.
 */
export function useOrgContext(slug: string) {
  const { organizations, getFull, refresh: refreshOrgs } = useOrgs();
  const { user } = useAuth();

  interface CtxEntry {
    full: OrgFull | null;
    visibility: "public" | "private";
  }
  // Keyed by user id + slug so a sign-in change can never serve another
  // account's members/invitations.
  const cache = useState<Record<string, CtxEntry>>("org-context", () => ({}));
  const cacheKey = computed(() => `${user.value?.id ?? "-"}:${slug}`);
  const cached = cache.value[cacheKey.value];

  const org = computed(() => organizations.value.find((o) => o.slug === slug));
  const full = ref<OrgFull | null>(cached?.full ?? null);
  // Only the FIRST visit (no cache) shows the full-page loader; tab switches
  // render immediately from cache.
  const loading = ref(!cached);
  const notFound = ref(false);

  const myRole = computed<OrgRole | null>(() => {
    const uid = user.value?.id;
    if (!full.value || !uid) return null;
    return full.value.members.find((m) => m.userId === uid)?.role ?? null;
  });
  const isPrivileged = computed(
    () => myRole.value === "owner" || myRole.value === "admin",
  );

  // Custom roles resolve to base names in member.role; keep the raw string.
  const visibility = ref<"public" | "private">(cached?.visibility ?? "public");

  function persist(): void {
    cache.value = {
      ...cache.value,
      [cacheKey.value]: { full: full.value, visibility: visibility.value },
    };
  }

  async function load() {
    if (!cache.value[cacheKey.value]) loading.value = true;
    notFound.value = false;
    try {
      // Direct navigation: the org list may not be populated yet — refresh it
      // before concluding the org is unknown.
      if (!org.value) await refreshOrgs().catch(() => {});
      if (!org.value) {
        notFound.value = true;
        return;
      }
      full.value = await getFull(org.value.id);
      const v = await $fetch<VisibilityResponse>(
        `/api/orgs/${org.value.id}/visibility`,
      ).catch(() => null);
      if (v) visibility.value = v.visibility;
      persist();
    } finally {
      loading.value = false;
    }
  }

  return {
    org,
    full,
    loading,
    notFound,
    myRole,
    isPrivileged,
    visibility,
    load,
  };
}
