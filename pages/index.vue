<script setup lang="ts">
import type { CampaignPublic } from "#shared/types";

// GitHub-style dashboard: left sidebar (my orgs / personal / explore + new
// button) and a unified campaign card feed. Creating campaigns lives at /new;
// uploading & reviewing live on each campaign's repo-style detail page.
definePageMeta({ layout: "default" });
const { t } = useI18n();
const { user } = useAuth();
const { organizations, refresh: refreshOrgs } = useOrgs();
const route = useRoute();

const loading = ref(true);
const personal = ref<CampaignPublic[]>([]);
const orgCampaigns = ref<CampaignPublic[]>([]);
const collaborations = ref<CampaignPublic[]>([]);

/** Unified feed, newest first, tagged with its section for the card badge. */
const feed = computed(
  () =>
    [
      ...personal.value.map((c) => ({ ...c, kind: "personal" as const })),
      ...orgCampaigns.value.map((c) => ({ ...c, kind: "org" as const })),
      ...collaborations.value.map((c) => ({ ...c, kind: "collab" as const })),
    ].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
);

const orgName = (id: string | null): string | null =>
  id ? (organizations.value.find((o) => o.id === id)?.name ?? null) : null;

function campaignHref(c: { id: number; orgSlug: string | null }): string {
  return c.orgSlug
    ? `/orgs/${c.orgSlug}/campaigns/${c.id}`
    : `/personal/${c.id}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const VIS_CLS: Record<string, string> = {
  public: "border-primary/40 text-foreground",
  internal: "border-border text-muted-foreground",
  private: "border-border text-muted-foreground",
};
const ST_CLS: Record<string, string> = {
  active: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  closed: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  archived: "border-border text-muted-foreground",
};

onMounted(async () => {
  void refreshOrgs();
  // Legacy deep link /?campaign=<id> → redirect to the campaign page.
  const cid = Number(route.query.campaign);
  if (cid) {
    try {
      const data = await $fetch<{ org_slug: string | null }>(
        `/api/campaigns/${cid}`,
      );
      navigateTo(
        data.org_slug
          ? `/orgs/${data.org_slug}/campaigns/${cid}`
          : `/personal/${cid}`,
        { replace: true },
      );
      return;
    } catch {
      // No access / not found — fall through to the dashboard with a clean URL.
      navigateTo({ path: "/", query: {} }, { replace: true });
    }
  }
  loading.value = true;
  try {
    const data = await listCampaigns();
    personal.value = data.personal;
    orgCampaigns.value = data.organizations;
    collaborations.value = data.collaborations;
  } catch {
    // the feed just stays empty
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="flex flex-col gap-6 lg:flex-row">
    <!-- sidebar -->
    <aside class="w-full shrink-0 lg:w-64">
      <div class="flex items-center gap-3 rounded-lg border p-3">
        <span
          class="flex size-10 shrink-0 items-center justify-center rounded-full border bg-muted text-sm font-semibold"
          >{{ (user?.name || user?.email || "?")[0]?.toUpperCase() }}</span
        >
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold">{{ user?.name }}</p>
          <p class="truncate text-xs text-muted-foreground">
            {{ user?.email }}
          </p>
        </div>
      </div>

      <Button class="mt-4 w-full" @click="navigateTo('/new')">
        <Icon spec="Plus" :size="16" />
        {{ t("nav.newCampaign") }}
      </Button>

      <nav class="mt-4 flex flex-col gap-0.5">
        <NuxtLink
          to="/explore"
          class="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Icon spec="Compass" :size="15" />
          {{ t("explore.title") }}
        </NuxtLink>
        <div
          class="mt-2 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          {{ t("dashboard.myOrgs") }}
        </div>
        <NuxtLink
          v-for="o in organizations"
          :key="o.id"
          :to="`/orgs/${o.slug}`"
          class="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent"
        >
          <Icon spec="Building2" :size="15" class="text-muted-foreground" />
          <span class="truncate">{{ o.name }}</span>
        </NuxtLink>
        <p
          v-if="!organizations.length"
          class="px-3 py-1 text-xs text-muted-foreground"
        >
          {{ t("orgs.noOrgs") }}
        </p>
      </nav>
    </aside>

    <!-- feed -->
    <div class="min-w-0 flex-1">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-lg font-semibold">{{ t("dashboard.title") }}</h2>
        <span class="text-xs text-muted-foreground"
          >{{ feed.length }} {{ t("dashboard.count") }}</span
        >
      </div>

      <div
        v-if="loading"
        class="rounded-lg border py-16 text-center text-sm text-muted-foreground"
      >
        {{ t("settings.loading") }}
      </div>
      <div v-else-if="!feed.length" class="rounded-lg border py-16 text-center">
        <Icon
          spec="FolderOpen"
          :size="28"
          class="mx-auto mb-3 text-muted-foreground"
        />
        <p class="text-sm text-muted-foreground">{{ t("dashboard.empty") }}</p>
        <Button class="mt-4" size="sm" @click="navigateTo('/new')">
          <Icon spec="Plus" :size="14" />
          {{ t("nav.newCampaign") }}
        </Button>
      </div>
      <div v-else class="flex flex-col gap-3">
        <NuxtLink
          v-for="c in feed"
          :key="c.id"
          :to="campaignHref(c)"
          class="flex flex-col gap-1.5 rounded-lg border p-4 transition-colors hover:bg-accent/40"
        >
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <span
              class="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-muted-foreground"
            >
              <Icon
                :spec="c.kind === 'personal' ? 'User' : c.kind === 'collab' ? 'UserPlus' : 'Building2'"
                :size="11"
              />
              {{
                c.kind === "personal"
                  ? t("home.scope.personal")
                  : c.kind === "collab"
                    ? t("home.collab.section")
                    : (orgName(c.organizationId) ?? t("home.scope.org"))
              }}
            </span>
            <span
              class="rounded-full border px-2 py-0.5"
              :class="VIS_CLS[c.visibility]"
              >{{ t(`home.settings.vis.${c.visibility}`) }}</span
            >
            <span
              class="rounded-full border px-2 py-0.5"
              :class="ST_CLS[c.status]"
              >{{ t(`home.settings.st.${c.status}`) }}</span
            >
            <span class="ml-auto text-muted-foreground">{{
              fmtDate(c.createdAt)
            }}</span>
          </div>
          <span class="font-semibold">{{ c.name || c.expectedTitle }}</span>
          <span class="truncate text-xs text-muted-foreground">{{
            c.expectedTitle
          }}</span>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
