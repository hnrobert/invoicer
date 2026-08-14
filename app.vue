<script setup lang="ts">
import { useMutationObserver } from "@vueuse/core";

// Site title is locale-aware (中文 / English), so the document title template
// reads the active translation.
const { t } = useI18n();
const siteTitle = computed(() => t("site.title"));

// One rule for every browser tab title: untitled/homepage → just the site name;
// any page that sets its own title → "{title} · {site}". Reading siteTitle.value
// inside the template keeps it reactive to locale switches.
useHead({
  titleTemplate: (title?: string) =>
    !title || title === siteTitle.value
      ? siteTitle.value
      : `${title} · ${siteTitle.value}`,
});

// Dark mode is driven by the `dark` class on <html> (toggled from the vg.theme
// storage key). Track that class so the floating toaster matches the app.
const isDark = ref(false);
const toasterTheme = computed<"light" | "dark">(() =>
  isDark.value ? "dark" : "light",
);
onMounted(() => {
  const el = document.documentElement;
  isDark.value = el.classList.contains("dark");
  useMutationObserver(
    el,
    () => {
      isDark.value = el.classList.contains("dark");
    },
    { attributes: true, attributeFilter: ["class"] },
  );
});
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <Toaster
      position="top-right"
      rich-colors
      close-button
      :theme="toasterTheme"
    />
  </div>
</template>
