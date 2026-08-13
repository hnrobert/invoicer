<script setup lang="ts">
import { useMutationObserver } from '@vueuse/core'
import { SITE_TITLE } from '#shared/lib/site'

// One rule for every browser tab title: untitled/homepage → just the site name;
// any page that sets its own title → "{title} · 发票审核系统".
useHead({
  titleTemplate: (title?: string) =>
    !title || title === SITE_TITLE ? SITE_TITLE : `${title} · ${SITE_TITLE}`,
})

// Dark mode is driven by the `dark` class on <html> (toggled from the vg.theme
// storage key). Track that class so the floating toaster matches the app.
const isDark = ref(false)
const toasterTheme = computed<'light' | 'dark'>(() => (isDark.value ? 'dark' : 'light'))
onMounted(() => {
  const el = document.documentElement
  isDark.value = el.classList.contains('dark')
  useMutationObserver(
    el,
    () => {
      isDark.value = el.classList.contains('dark')
    },
    { attributes: true, attributeFilter: ['class'] },
  )
})
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <Toaster position="top-right" rich-colors close-button :theme="toasterTheme" />
  </div>
</template>
