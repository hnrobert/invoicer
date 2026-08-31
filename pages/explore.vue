<script setup lang="ts">
import type { ExploreResponse } from "#shared/api";
import type { CampaignPublic } from "#shared/types";

type ExploreItem = CampaignPublic & { orgName: string | null };

definePageMeta({ layout: "default" });
const { t } = useI18n();
useHead({ title: () => t("explore.title") });

const q = ref("");
const loading = ref(true);
const items = ref<ExploreItem[]>([]);

async function load() {
  loading.value = true;
  try {
    const data = await $fetch<ExploreResponse>("/api/explore", {
      query: q.value.trim() ? { q: q.value.trim() } : {},
    });
    items.value = data.campaigns;
  } catch (e) {
    toast.error(t("explore.loadFailed") + (e as Error).message);
  } finally {
    loading.value = false;
  }
}

/** Open a plaza campaign at the home page via deep link (public upload there). */
function open(c: ExploreItem) {
  navigateTo({ path: "/", query: { campaign: c.id } });
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-col gap-2">
      <h2 class="text-2xl font-semibold tracking-tight">
        {{ t("explore.title") }}
      </h2>
      <p class="text-sm text-muted-foreground">{{ t("explore.desc") }}</p>
    </div>

    <form class="flex gap-2" @submit.prevent="load">
      <div class="relative flex-1">
        <Icon
          spec="Search"
          :size="14"
          class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          v-model="q"
          :placeholder="t('explore.searchPlaceholder')"
          class="pl-8"
        />
      </div>
      <Button type="submit" variant="outline">{{ t("explore.search") }}</Button>
    </form>

    <div v-if="loading" class="py-10 text-center text-sm text-muted-foreground">
      {{ t("settings.loading") }}
    </div>
    <div v-else-if="items.length" class="grid gap-3 sm:grid-cols-2">
      <button
        v-for="c in items"
        :key="c.id"
        type="button"
        class="flex flex-col gap-1.5 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/50"
        @click="open(c)"
      >
        <div class="flex items-center gap-2">
          <Icon spec="Building2" :size="14" class="text-muted-foreground" />
          <span class="truncate text-xs text-muted-foreground">{{
            c.orgName || "—"
          }}</span>
          <span
            v-if="c.status === 'closed'"
            class="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
            >{{ t("explore.closed") }}</span
          >
        </div>
        <span class="font-medium">{{ c.name || c.expectedTitle }}</span>
        <span class="truncate text-xs text-muted-foreground">{{
          c.expectedTitle
        }}</span>
      </button>
    </div>
    <div v-else class="py-10 text-center text-sm text-muted-foreground">
      {{ t("explore.empty") }}
    </div>
  </div>
</template>
