<script setup lang="ts">
// GitHub-style organization profile header: big avatar + name + visibility
// badge, and a link-based tab bar (Campaigns / Members / Settings). The tabs
// navigate to the org's sub-pages; `settings` renders only for privileged
// members (the server enforces the underlying endpoints anyway).
const { t } = useI18n();
const props = defineProps<{
  slug: string;
  name: string;
  visibility: "public" | "private";
  showSettings: boolean;
}>();

const route = useRoute();
const tabs = computed(() => {
  const base = [
    {
      key: "index",
      to: `/orgs/${props.slug}`,
      label: t("orgs.tabs.campaigns"),
    },
    {
      key: "members",
      to: `/orgs/${props.slug}/members`,
      label: t("orgs.tabs.members"),
    },
  ];
  if (props.showSettings) {
    base.push({
      key: "settings",
      to: `/orgs/${props.slug}/settings`,
      label: t("orgs.tabs.settings"),
    });
  }
  return base;
});
const activeKey = computed(() =>
  route.path.endsWith("/members")
    ? "members"
    : route.path.endsWith("/settings")
      ? "settings"
      : "index",
);
</script>

<template>
  <div class="border-b pb-0">
    <div class="flex items-center gap-4 py-6">
      <span
        class="flex size-16 shrink-0 items-center justify-center rounded-full border bg-muted"
      >
        <Icon spec="Building2" :size="28" class="text-muted-foreground" />
      </span>
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="truncate text-xl font-semibold">{{ name }}</h1>
          <span
            class="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
            >{{
              visibility === "public"
                ? t("orgs.vis.public")
                : t("orgs.vis.private")
            }}</span
          >
        </div>
        <p class="mt-0.5 text-sm text-muted-foreground">{{ slug }}</p>
      </div>
    </div>
    <nav class="flex gap-1">
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.key"
        :to="tab.to"
        class="flex items-center gap-1.5 rounded-t-md px-3 py-2 text-sm transition-colors"
        :class="
          activeKey === tab.key
            ? 'border-t-2 border-primary font-medium text-foreground'
            : 'border-t-2 border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground'
        "
      >
        {{ tab.label }}
      </NuxtLink>
    </nav>
  </div>
</template>
