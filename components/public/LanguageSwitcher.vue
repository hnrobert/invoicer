<script setup lang="ts">
// Cycles through the configured locales (zh ↔ en). The available locales come
// from the i18n module config in nuxt.config.ts.
const { locale, locales, setLocale, t } = useI18n();

// locales carries the typed locale codes ('zh' | 'en'); narrow so .code keeps
// that union (setLocale requires it). `name` is the display label from config.
const list = computed(
  () => locales.value as { code: "zh" | "en"; name?: string }[],
);
const current = computed(() => list.value.find((l) => l.code === locale.value));

function toggle() {
  const codes = list.value.map((l) => l.code);
  const idx = codes.indexOf(locale.value);
  const next = codes[(idx + 1) % codes.length];
  if (next) setLocale(next);
}
</script>

<template>
  <button
    type="button"
    :aria-label="t('lang.switch')"
    class="inline-flex h-9 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
    @click="toggle"
  >
    <Icon spec="Languages" :size="15" />
    {{ current?.name }}
  </button>
</template>
