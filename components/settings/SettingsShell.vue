<script setup lang="ts">
import type { RouteLocationRaw } from "vue-router";

// GitHub settings layout: a title, then a two-column body — left section nav
// (NuxtLinks) + right content. Used by /admin, org settings, and the campaign
// settings tab. The parent decides which section is active (`active` prop) so
// both sub-route and ?section= navigation styles work.
defineProps<{
  title: string;
  active: string;
  /** { key, label, to } — to=null renders a plain group heading row. */
  sections: { key: string; label: string; to?: RouteLocationRaw | null }[];
}>();
</script>

<template>
  <div class="flex flex-col gap-6 lg:flex-row lg:gap-10">
    <aside class="w-full shrink-0 lg:w-56">
      <h2 class="mb-2 text-base font-semibold">{{ title }}</h2>
      <nav class="flex flex-col gap-0.5">
        <template v-for="s in sections" :key="s.key">
          <div
            v-if="!s.to"
            class="mt-3 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {{ s.label }}
          </div>
          <NuxtLink
            v-else
            :to="s.to"
            class="rounded-md px-2 py-1.5 text-sm transition-colors"
            :class="
              active === s.key
                ? 'bg-accent font-medium text-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            "
          >
            {{ s.label }}
          </NuxtLink>
        </template>
      </nav>
    </aside>
    <div class="min-w-0 flex-1">
      <slot />
    </div>
  </div>
</template>
