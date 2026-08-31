import type { VisibilityResponse } from "#shared/api";
import type { OrgFull, OrgRole } from "#shared/types";

/**
 * Shared context for the /orgs/[slug]/* pages: resolves the org by slug from
 * the user's organization list (org pages are member-only — outsiders
 * discover public campaigns via the plaza), loads the full org (members,
 * invitations), the caller's role, and the org's platform visibility.
 */
export function useOrgContext(slug: string) {
  const { organizations, getFull, refresh: refreshOrgs } = useOrgs();
  const { user } = useAuth();

  const org = computed(() => organizations.value.find((o) => o.slug === slug));
  const full = ref<OrgFull | null>(null);
  const loading = ref(true);
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
  const visibility = ref<"public" | "private">("public");

  async function load() {
    loading.value = true;
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
