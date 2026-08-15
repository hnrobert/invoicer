<script setup lang="ts">
// /admin → default to the mail section.
definePageMeta({ layout: "default", middleware: "superadmin" });
onMounted(() => navigateTo("/admin/mail", { replace: true }));
</script>

<template>
  <div class="py-16 text-center text-sm text-muted-foreground">
    <Icon spec="LoaderCircle" :size="20" class="mx-auto animate-spin" />
  </div>
</template>
