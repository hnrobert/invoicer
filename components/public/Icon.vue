<script setup lang="ts">
import { computed } from "vue";
import { resolveIcon } from "~/lib/icon";
import { iconRegistry } from "~/lib/iconAllowlist";
import type { IconRef } from "#shared/types";

// Simplified icon renderer for the invoice app: resolves a lucide name from the
// curated registry. (The reference project also supported org-uploaded images;
// this app only needs named lucide icons.)
const FALLBACK_ICON = iconRegistry["CircleHelp"]!;

const props = withDefaults(
  defineProps<{
    spec?: IconRef;
    size?: number | string;
    strokeWidth?: number;
  }>(),
  { size: "1em", strokeWidth: 2 },
);

const comp = computed(() => resolveIcon(props.spec) ?? FALLBACK_ICON);
const sizePx = computed(() =>
  typeof props.size === "number" ? `${props.size}px` : props.size,
);
</script>

<template>
  <component
    :is="comp"
    :size="sizePx"
    :stroke-width="strokeWidth"
    aria-hidden="true"
  />
</template>
