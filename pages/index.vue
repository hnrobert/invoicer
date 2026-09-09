<script setup lang="ts">
import type { CampaignDetailResponse } from "#shared/api";
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
const feed = computed(() =>
  [
    ...personal.value.map((c) => ({ ...c, kind: "personal" as const })),
    ...orgCampaigns.value.map((c) => ({ ...c, kind: "org" as const })),
    ...collaborations.value.map((c) => ({ ...c, kind: "collab" as const })),
  ].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  ),
);

const orgName = (id: string | null): string | null =>
  id ? (organizations.value.find((o) => o.id === id)?.name ?? null) : null;

/** Client-side quick filter over the unified feed (name / title / org). */
const q = ref("");
const visible = computed(() => {
  const needle = q.value.trim().toLowerCase();
  if (!needle) return feed.value;
  return feed.value.filter(
    (c) =>
      (c.name || "").toLowerCase().includes(needle) ||
      c.expectedTitle.toLowerCase().includes(needle) ||
      (orgName(c.organizationId) ?? "").toLowerCase().includes(needle),
  );
});

function campaignHref(c: { id: number; orgSlug: string | null }): string {
  return c.orgSlug
    ? `/orgs/${c.orgSlug}/campaigns/${c.id}`
    : `/personal/${c.id}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
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
      const data = await $fetch<Pick<CampaignDetailResponse, "org_slug">>(
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
      <!-- toolbar: title + count left, quick filter + primary action right -->
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <h2 class="text-lg font-semibold">{{ t("dashboard.title") }}</h2>
        <span class="font-mono text-xs text-muted-foreground">{{
          visible.length
        }}</span>
        <div class="ml-auto flex items-center gap-2">
          <div class="relative">
            <Icon
              spec="Search"
              :size="14"
              class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              v-model="q"
              type="search"
              :placeholder="t('dashboard.filter')"
              class="h-9 w-44 rounded-md border bg-muted/40 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:bg-background sm:w-56"
            />
          </div>
          <Button size="sm" variant="outline" @click="navigateTo('/new')">
            <Icon spec="FolderPlus" :size="14" />
            {{ t("nav.newCampaign") }}
          </Button>
        </div>
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
      <!-- GitHub-style: ONE box, hairline-divided dense rows (not cards) -->
      <div v-else class="overflow-hidden rounded-lg border">
        <NuxtLink
          v-for="(c, i) in visible"
          :key="c.id"
          :to="campaignHref(c)"
          class="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/40"
          :class="i > 0 ? 'border-t' : ''"
        >
          <Icon
            :spec="
              c.kind === 'personal'
                ? 'User'
                : c.kind === 'collab'
                  ? 'UserPlus'
                  : 'Building2'
            "
            :size="16"
            class="shrink-0 text-muted-foreground"
          />
          <div class="min-w-0 flex-1">
            <div class="flex min-w-0 items-baseline gap-2">
              <span class="truncate text-sm font-medium hover:underline">{{
                c.name || c.expectedTitle
              }}</span>
              <span
                v-if="c.kind !== 'personal' && orgName(c.organizationId)"
                class="hidden truncate text-xs text-muted-foreground sm:inline"
                >{{ orgName(c.organizationId) }}</span
              >
            </div>
            <p class="truncate text-xs text-muted-foreground">
              {{ c.expectedTitle || "—" }}
            </p>
          </div>
          <span
            class="hidden rounded-full border px-2 py-px text-xs"
            :class="VIS_CLS[c.visibility]"
            >{{ t(`home.settings.vis.${c.visibility}`) }}</span
          >
          <span
            class="rounded-full border px-2 py-px text-xs"
            :class="ST_CLS[c.status]"
            >{{ t(`home.settings.st.${c.status}`) }}</span
          >
          <span
            class="hidden w-24 shrink-0 text-right font-mono text-xs text-muted-foreground sm:inline"
            >{{ fmtDate(c.createdAt) }}</span
          >
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
