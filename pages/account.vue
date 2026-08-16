<script setup lang="ts">
// Account management moved into the unified Settings hub (/settings). Redirect.
definePageMeta({ layout: "default" });
onMounted(() =>
  navigateTo({ path: "/settings", query: { section: "profile" } }, { replace: true }),
);
</script>

<template>
  <div class="py-16 text-center text-sm text-muted-foreground">
    <Icon spec="LoaderCircle" :size="20" class="mx-auto animate-spin" />
  </div>
</template>
