<script setup lang="ts">
// GitHub-style global nav shell: brand + search on the left/center, and on
// the right the "+" create dropdown, the notification bell, and an avatar
// menu (account / mail settings / sign out). Themed (follows light/dark).
const { t } = useI18n();
const { user, signOut } = useAuth();
const route = useRoute();

const searchQ = ref((route.query.q as string) ?? "");
function submitSearch() {
  navigateTo({
    path: "/explore",
    query: searchQ.value.trim() ? { q: searchQ.value.trim() } : {},
  });
}

const createOpen = ref(false);
const userOpen = ref(false);
</script>

<template>
  <div class="flex min-h-screen flex-col bg-background">
    <header class="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
      <div
        class="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6"
      >
        <!-- brand -->
        <NuxtLink to="/" class="flex shrink-0 items-center gap-2">
          <span
            class="flex size-8 items-center justify-center rounded-full border bg-background"
          >
            <img src="/favicon.svg" alt="" class="size-6" />
          </span>
          <span class="hidden text-sm font-semibold sm:inline">{{
            t("site.title")
          }}</span>
        </NuxtLink>

        <!-- search -->
        <form class="relative ml-2 hidden max-w-md flex-1 sm:block" @submit.prevent="submitSearch">
          <Icon
            spec="Search"
            :size="14"
            class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            v-model="searchQ"
            type="search"
            :placeholder="t('nav.searchPlaceholder')"
            class="h-9 w-full rounded-md border bg-muted/40 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:bg-background"
          />
        </form>

        <div class="ml-auto flex items-center gap-1.5">
          <template v-if="user">
            <!-- "+" create dropdown -->
            <div class="relative">
              <div
                v-if="createOpen"
                class="fixed inset-0 z-10"
                @click="createOpen = false"
              />
              <button
                type="button"
                :aria-label="t('nav.new')"
                class="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                @click="createOpen = !createOpen"
              >
                <Icon spec="Plus" :size="18" />
                <Icon spec="ChevronDown" :size="12" />
              </button>
              <div
                v-if="createOpen"
                class="absolute right-0 z-20 mt-1 flex w-44 flex-col overflow-hidden rounded-md border bg-popover py-1 shadow-md"
              >
                <NuxtLink
                  to="/new"
                  class="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                  @click="createOpen = false"
                >
                  <Icon spec="FolderPlus" :size="14" />
                  {{ t("nav.newCampaign") }}
                </NuxtLink>
                <NuxtLink
                  to="/new#org"
                  class="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                  @click="createOpen = false"
                >
                  <Icon spec="Building2" :size="14" />
                  {{ t("nav.newOrg") }}
                </NuxtLink>
              </div>
            </div>

            <NotificationBell />

            <!-- avatar dropdown -->
            <div class="relative">
              <div
                v-if="userOpen"
                class="fixed inset-0 z-10"
                @click="userOpen = false"
              />
              <button
                type="button"
                :aria-label="t('account.title')"
                class="flex size-9 items-center justify-center rounded-full border bg-muted text-sm font-semibold"
                @click="userOpen = !userOpen"
              >
                {{ (user.name || user.email)[0]?.toUpperCase() }}
              </button>
              <div
                v-if="userOpen"
                class="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-md border bg-popover py-1 shadow-md"
              >
                <div class="border-b px-3 py-2">
                  <p class="truncate text-sm font-medium">{{ user.name }}</p>
                  <p class="truncate text-xs text-muted-foreground">
                    {{ user.email }}
                  </p>
                </div>
                <NuxtLink
                  to="/account"
                  class="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                  @click="userOpen = false"
                >
                  <Icon spec="UserCircle" :size="14" />
                  {{ t("account.title") }}
                </NuxtLink>
                <NuxtLink
                  to="/settings"
                  class="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                  @click="userOpen = false"
                >
                  <Icon spec="Settings" :size="14" />
                  {{ t("settings.title") }}
                </NuxtLink>
                <button
                  type="button"
                  class="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                  @click="userOpen = false; signOut()"
                >
                  <Icon spec="LogOut" :size="14" />
                  {{ t("auth.user.logout") }}
                </button>
              </div>
            </div>
          </template>

          <NuxtLink
            v-else
            to="/login"
            class="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {{ t("auth.user.login") }}
          </NuxtLink>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
      <slot />
    </main>

    <SiteFooter />
  </div>
</template>
