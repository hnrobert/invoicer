<script setup lang="ts">
import { SITE_TITLE, SITE_SUBTITLE } from '#shared/lib/site'
</script>

<template>
  <div class="relative flex min-h-screen flex-col bg-background">
    <!-- decorative yellow blob (matches the reference project's motif) -->
    <div
      class="pointer-events-none absolute -top-40 left-1/2 size-[42rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
    />

    <header class="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
      <div class="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm"
        >
          <Icon spec="ReceiptText" :size="20" />
        </span>
        <div class="min-w-0">
          <h1 class="truncate text-sm font-semibold leading-tight sm:text-base">{{ SITE_TITLE }}</h1>
          <p class="truncate text-xs text-foreground/60">{{ SITE_SUBTITLE }}</p>
        </div>
        <div class="ml-auto flex items-center gap-1">
          <NuxtLink
            to="/settings"
            aria-label="邮件设置"
            class="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Icon spec="Settings" :size="18" />
          </NuxtLink>
          <ThemeToggle />
        </div>
      </div>
    </header>

    <main class="relative mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
      <slot />
    </main>

    <SiteFooter />
  </div>
</template>
