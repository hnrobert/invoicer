<script setup lang="ts">
definePageMeta({ layout: "default" });
const { t } = useI18n();
useHead({ title: () => t("admin.denied") });
</script>

<template>
  <div class="py-20 text-center">
    <Icon spec="ShieldAlert" :size="32" class="mx-auto mb-4 text-muted-foreground" />
    <h1 class="mb-2 text-lg font-semibold">{{ t("admin.denied") }}</h1>
    <p class="text-sm text-muted-foreground">{{ t("admin.deniedDesc") }}</p>
    <Button class="mt-6" variant="outline" size="sm" @click="navigateTo('/')">
      {{ t("settings.back") }}
    </Button>
  </div>
</template>
