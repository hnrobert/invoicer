<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <div class="relative flex min-h-screen flex-col bg-background">
    <div
      aria-hidden="true"
      class="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div
        class="absolute -top-40 left-1/2 size-168 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />
    </div>
    <div class="flex flex-1 items-center justify-center p-4">
      <div class="w-full max-w-sm">
        <div
          class="mb-6 flex items-center justify-center gap-2 text-base font-semibold sm:text-lg"
        >
          <span
            class="flex size-9 shrink-0 items-center justify-center rounded-full border bg-background"
          >
            <img src="/favicon.svg" alt="" class="size-7" />
          </span>
          <span class="whitespace-nowrap">{{ t("site.title") }}</span>
        </div>
        <slot />
      </div>
    </div>
    <SiteFooter />
  </div>
</template>
