<script setup lang="ts">
import { SITE_TITLE } from '#shared/lib/site'
const year = new Date().getFullYear()
</script>

<template>
  <footer class="mt-2 px-4 py-4 text-center text-xs text-muted-foreground">
    <div class="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
      <span>© {{ year }} <NuxtLink to="/" class="underline-offset-2 hover:underline">{{ SITE_TITLE }}</NuxtLink></span>
      <span aria-hidden="true">·</span>
      <span>仅识别 PDF / 图片 · 金额以「价税合计」为准</span>
    </div>
  </footer>
</template>
