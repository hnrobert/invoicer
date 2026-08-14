<script setup lang="ts">
const { t } = useI18n();
const year = new Date().getFullYear();
</script>

<template>
  <footer class="mt-2 px-4 py-4 text-center text-xs text-muted-foreground">
    <div class="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
      <span
        >© {{ year }}
        <NuxtLink to="/" class="underline-offset-2 hover:underline">{{
          t("site.title")
        }}</NuxtLink></span
      >
      <span aria-hidden="true">·</span>
      <span>{{ t("footer.note") }}</span>
    </div>
  </footer>
</template>
