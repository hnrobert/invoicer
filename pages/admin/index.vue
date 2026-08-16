<script setup lang="ts">
// Site admin moved into the unified Settings hub (/settings, Admin group).
definePageMeta({ layout: "default" });
onMounted(() =>
  navigateTo({ path: "/settings", query: { section: "mail" } }, { replace: true }),
);
</script>

<template>
  <div class="py-16 text-center text-sm text-muted-foreground">
    <Icon spec="LoaderCircle" :size="20" class="mx-auto animate-spin" />
  </div>
</template>
