<script setup lang="ts">
// GitHub org profile → Campaigns tab: the org's campaigns as a list, with a
// "New campaign" button for members.
import type { CampaignPublic } from "#shared/types";

definePageMeta({ layout: "default" });
const { t } = useI18n();
const route = useRoute();
const slug = route.params.slug as string;
useHead({ title: () => slug });

const { org, loading, notFound, isPrivileged, visibility, load } =
  useOrgContext(slug);

const campaigns = ref<CampaignPublic[]>([]);
const listLoading = ref(true);

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

onMounted(async () => {
  await load();
  if (notFound.value) return;
  try {
    const data = await listCampaigns();
    campaigns.value = data.organizations.filter(
      (c) => c.organizationId === org.value?.id,
    );
  } catch {
    campaigns.value = [];
  } finally {
    listLoading.value = false;
  }
});
</script>

<template>
  <div v-if="notFound" class="py-16 text-center text-sm text-muted-foreground">
    {{ t("orgs.notFound") }}
    <NuxtLink to="/" class="ml-1 underline">{{ t("settings.back") }}</NuxtLink>
  </div>
  <div
    v-else-if="loading"
    class="py-16 text-center text-sm text-muted-foreground"
  >
    {{ t("settings.loading") }}
  </div>
  <div v-else-if="org" class="flex flex-col gap-6">
    <OrgHeader
      :slug="org.slug"
      :name="org.name"
      :visibility="visibility"
      :show-settings="isPrivileged"
    />

    <div class="flex items-center justify-between">
      <h2 class="text-sm font-medium text-muted-foreground">
        {{ campaigns.length }} {{ t("dashboard.count") }}
      </h2>
      <Button size="sm" @click="navigateTo('/new')">
        <Icon spec="Plus" :size="14" />
        {{ t("nav.newCampaign") }}
      </Button>
    </div>

    <div
      v-if="listLoading"
      class="rounded-lg border py-12 text-center text-sm text-muted-foreground"
    >
      {{ t("settings.loading") }}
    </div>
    <div
      v-else-if="!campaigns.length"
      class="rounded-lg border py-12 text-center text-sm text-muted-foreground"
    >
      {{ t("dashboard.empty") }}
    </div>
    <div v-else class="flex flex-col">
      <NuxtLink
        v-for="c in campaigns"
        :key="c.id"
        :to="`/orgs/${org.slug}/campaigns/${c.id}`"
        class="flex items-center gap-3 border-b py-3 transition-colors first:border-t hover:bg-accent/40"
      >
        <Icon
          spec="FolderOpen"
          :size="16"
          class="shrink-0 text-muted-foreground"
        />
        <span class="min-w-0 flex-1 truncate text-sm font-medium">{{
          c.name || c.expectedTitle
        }}</span>
        <span
          v-if="!c.visibilityConfirmed"
          class="rounded-full border border-amber-500/40 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400"
          >{{ t("orgs.migration.badge") }}</span
        >
        <span
          class="rounded-full border px-2 py-0.5 text-xs"
          :class="VIS_CLS[c.visibility]"
          >{{ t(`home.settings.vis.${c.visibility}`) }}</span
        >
        <span
          class="rounded-full border px-2 py-0.5 text-xs"
          :class="ST_CLS[c.status]"
          >{{ t(`home.settings.st.${c.status}`) }}</span
        >
        <span class="w-20 shrink-0 text-right text-xs text-muted-foreground">{{
          fmtDate(c.createdAt)
        }}</span>
      </NuxtLink>
    </div>
  </div>
</template>
