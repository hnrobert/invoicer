<script setup lang="ts">
const { t } = useI18n();
const { user, signOut } = useAuth();
</script>

<template>
  <div class="flex min-h-screen flex-col bg-background">
    <header class="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
      <div
        class="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6"
      >
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-full border bg-background"
        >
          <img src="/favicon.svg" alt="" class="size-7" />
        </span>
        <div class="min-w-0">
          <h1 class="truncate text-sm font-semibold leading-tight sm:text-base">
            {{ t("site.title") }}
          </h1>
          <p class="truncate text-xs text-foreground/60">
            {{ t("site.subtitle") }}
          </p>
        </div>
        <div class="ml-auto flex items-center gap-1">
          <!-- account: logged-in shows email (→ account) + logout, logged-out shows login -->
          <div v-if="user" class="flex items-center gap-1">
            <NuxtLink
              to="/account"
              class="hidden max-w-40 truncate text-xs text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              {{ user.email }}
            </NuxtLink>
            <button
              type="button"
              :aria-label="t('auth.user.logout')"
              class="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              @click="signOut"
            >
              <Icon spec="LogOut" :size="18" />
            </button>
          </div>
          <NuxtLink
            v-else
            to="/login"
            :aria-label="t('auth.user.login')"
            class="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Icon spec="LogIn" :size="18" />
          </NuxtLink>
          <NuxtLink
            to="/organizations"
            :aria-label="t('orgs.title')"
            class="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Icon spec="Building2" :size="18" />
          </NuxtLink>
          <NuxtLink
            to="/account"
            :aria-label="t('account.title')"
            class="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Icon spec="UserCircle" :size="18" />
          </NuxtLink>
          <NuxtLink
            to="/settings"
            :aria-label="t('settings.title')"
            class="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Icon spec="Settings" :size="18" />
          </NuxtLink>
        </div>
      </div>
    </header>

    <main
      class="relative mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8"
    >
      <slot />
    </main>

    <SiteFooter />
  </div>
</template>
