<script setup lang="ts">
import { useColorMode } from "@vueuse/core";
import { Sun, Moon } from "lucide-vue-next";

const { t } = useI18n();

// Class-based dark mode on <html>, sharing the `vg.theme` storage key used by
// the no-FOUC inline script in nuxt.config.ts.
const mode = useColorMode({ storageKey: "vg.theme" });

function toggle() {
  mode.value = mode.value === "dark" ? "light" : "dark";
}
</script>

<template>
  <button
    type="button"
    :aria-label="mode === 'dark' ? t('theme.toLight') : t('theme.toDark')"
    class="inline-flex size-9 items-center justify-center rounded-md border bg-background text-foreground transition-colors hover:bg-accent"
    @click="toggle"
  >
    <component :is="mode === 'dark' ? Sun : Moon" :size="16" />
  </button>
</template>
