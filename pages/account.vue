<script setup lang="ts">
import { useColorMode } from "@vueuse/core";
import type { ProviderId } from "~/composables/useAuth";

// Auth is enforced by the global auth.global.ts middleware; /account is not in
// its PUBLIC allowlist, so it is protected without a per-page middleware name.
const { t } = useI18n();
const { user, linkProvider, unlinkProvider, listAccounts, refreshUser } =
  useAuth();
const { list: enabledList } = useOAuthProviders();

// Preferences — theme + language live here (not in the header). Theme shares
// the `vg.theme` storage key used by the no-FOUC inline script in
// nuxt.config.ts; language defaults to the device language on first visit
// (i18n detectBrowserLanguage) and is remembered per browser via setLocale.
const colorMode = useColorMode({ storageKey: "vg.theme" });
const { locale, locales, setLocale } = useI18n();
const localeList = computed(
  () => locales.value as { code: "zh" | "en"; name?: string }[],
);

// Emails — primary (account email) + linked secondaries, GitHub-style.
const emails = ref<{ email: string; primary: boolean }[]>([]);
const newEmail = ref("");
const emailBusy = ref(false);

async function refreshEmails() {
  try {
    const data = await $fetch<{ emails: typeof emails.value }>(
      "/api/account/emails",
    );
    emails.value = data.emails;
  } catch {
    emails.value = [];
  }
}
async function addEmail() {
  if (!newEmail.value.trim()) return;
  emailBusy.value = true;
  try {
    const data = await $fetch<{ emails: typeof emails.value }>(
      "/api/account/emails",
      { method: "POST", body: { email: newEmail.value.trim() } },
    );
    emails.value = data.emails;
    newEmail.value = "";
    toast.success(t("account.emails.added"));
  } catch (e) {
    toast.error((e as Error).message);
  } finally {
    emailBusy.value = false;
  }
}
async function removeEmail(email: string) {
  try {
    const data = await $fetch<{ emails: typeof emails.value }>(
      `/api/account/emails/${encodeURIComponent(email)}`,
      { method: "DELETE" },
    );
    emails.value = data.emails;
  } catch (e) {
    toast.error((e as Error).message);
  }
}
async function makePrimary(email: string) {
  try {
    const data = await $fetch<{ emails: typeof emails.value }>(
      "/api/account/emails/primary",
      { method: "PUT", body: { email } },
    );
    emails.value = data.emails;
    toast.success(t("account.emails.primarySet"));
    // The account header/email display comes from the session user — refresh.
    await refreshUser();
  } catch (e) {
    toast.error((e as Error).message);
  }
}

useHead({ title: () => t("account.title") });

const accounts = ref<
  Array<{ id: string; providerId: string; accountId: string }>
>([]);
const loading = ref(false);

// Provider ids we can link (only the ones configured server-side).
const linkable = computed<ProviderId[]>(() => enabledList.value);

function isLinked(provider: ProviderId) {
  return accounts.value.some((a) => a.providerId === provider);
}

async function refresh() {
  loading.value = true;
  try {
    accounts.value = await listAccounts();
  } catch (e) {
    toast.error(messageFromError(e, t("account.loadFailed")));
  } finally {
    loading.value = false;
  }
}

async function onConnect(provider: ProviderId) {
  try {
    await linkProvider(provider);
    // Provider redirects away; on return the page remounts and refresh() runs.
  } catch (e) {
    toast.error(messageFromError(e, t("account.connectFailed")));
  }
}

async function onDisconnect(provider: ProviderId) {
  try {
    await unlinkProvider(provider);
    toast.success(t("account.disconnected"));
    await refresh();
  } catch (e) {
    toast.error(messageFromError(e, t("account.disconnectFailed")));
  }
}

onMounted(refresh);
onMounted(refreshEmails);
</script>

<template>
  <div class="flex flex-col gap-6">
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbPage>{{ t("account.title") }}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>

    <div class="flex flex-col gap-2">
      <h2 class="text-2xl font-semibold tracking-tight">
        {{ t("account.title") }}
      </h2>
      <p class="text-sm text-muted-foreground">{{ t("account.desc") }}</p>
    </div>

    <!-- Emails (primary + linked secondaries) -->
    <Card>
      <CardHeader>
        <CardTitle>{{ t("account.emails.title") }}</CardTitle>
        <CardDescription>{{ t("account.emails.desc") }}</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-3">
        <div
          v-for="e in emails"
          :key="e.email"
          class="flex items-center gap-3 rounded-lg border p-3"
        >
          <Icon spec="Mail" :size="18" class="text-muted-foreground" />
          <span class="min-w-0 flex-1 truncate text-sm font-medium">{{
            e.email
          }}</span>
          <span
            v-if="e.primary"
            class="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground"
            >{{ t("account.emails.primaryTag") }}</span
          >
          <template v-else>
            <Button variant="outline" size="sm" @click="makePrimary(e.email)">{{
              t("account.emails.makePrimary")
            }}</Button>
            <Button variant="ghost" size="sm" @click="removeEmail(e.email)">{{
              t("account.emails.remove")
            }}</Button>
          </template>
        </div>
        <form class="flex gap-2" @submit.prevent="addEmail">
          <Input
            v-model="newEmail"
            type="email"
            :placeholder="t('account.emails.placeholder')"
            class="flex-1"
          />
          <Button type="submit" variant="outline" :disabled="emailBusy">
            {{ t("account.emails.add") }}
          </Button>
        </form>
      </CardContent>
    </Card>

    <!-- Preferences (theme + language) -->
    <Card>
      <CardHeader>
        <CardTitle>{{ t("account.prefsTitle") }}</CardTitle>
        <CardDescription>{{ t("account.prefsDesc") }}</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <div class="flex flex-wrap items-center gap-3 text-sm">
          <span class="w-20 shrink-0 text-muted-foreground">{{
            t("account.themeLabel")
          }}</span>
          <div class="inline-flex rounded-lg border p-1">
            <button
              v-for="m in ['light', 'dark'] as const"
              :key="m"
              type="button"
              class="rounded-md px-3 py-1 text-xs font-medium transition-colors"
              :class="
                (colorMode === 'dark') === (m === 'dark')
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              "
              @click="colorMode = m"
            >
              {{ t(`theme.${m}`) }}
            </button>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-3 text-sm">
          <span class="w-20 shrink-0 text-muted-foreground">{{
            t("account.langLabel")
          }}</span>
          <div class="inline-flex rounded-lg border p-1">
            <button
              v-for="l in localeList"
              :key="l.code"
              type="button"
              class="rounded-md px-3 py-1 text-xs font-medium transition-colors"
              :class="
                locale === l.code
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              "
              @click="setLocale(l.code)"
            >
              {{ t(`lang.${l.code}`) }}
            </button>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Profile -->
    <Card>
      <CardHeader>
        <CardTitle>{{ t("account.profile") }}</CardTitle>
      </CardHeader>
      <CardContent class="flex flex-col gap-2 text-sm">
        <div class="flex items-center gap-2">
          <span class="w-20 shrink-0 text-muted-foreground">{{
            t("auth.register.nameLabel")
          }}</span>
          <span class="font-medium">{{ user?.name || "—" }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-20 shrink-0 text-muted-foreground">{{
            t("auth.login.emailLabel")
          }}</span>
          <span class="font-medium">{{ user?.email || "—" }}</span>
        </div>
      </CardContent>
    </Card>

    <!-- Linked providers -->
    <Card>
      <CardHeader>
        <CardTitle>{{ t("account.linkedTitle") }}</CardTitle>
        <CardDescription>{{ t("account.linkedDesc") }}</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-3">
        <!-- Email & password: always available -->
        <div class="flex items-center gap-3 rounded-lg border p-3">
          <Icon spec="Mail" :size="18" class="text-muted-foreground" />
          <span class="text-sm font-medium">{{
            t("account.emailPassword")
          }}</span>
          <span
            class="ml-auto rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground"
            >{{ t("account.profile") }}</span
          >
        </div>

        <!-- Each configurable provider: connect / disconnect -->
        <div
          v-for="provider in linkable"
          :key="provider"
          class="flex items-center gap-3 rounded-lg border p-3"
        >
          <Icon
            :spec="provider === 'github' ? 'Github' : 'MessageCircle'"
            :size="18"
            class="text-muted-foreground"
          />
          <span class="text-sm font-medium">
            {{
              provider === "github"
                ? t("auth.oauth.github")
                : t("auth.oauth.wechat")
            }}
          </span>
          <Button
            v-if="isLinked(provider)"
            type="button"
            variant="outline"
            size="sm"
            class="ml-auto"
            @click="onDisconnect(provider)"
          >
            {{ t("account.disconnect") }}
          </Button>
          <Button
            v-else
            type="button"
            size="sm"
            class="ml-auto"
            @click="onConnect(provider)"
          >
            {{ t("account.connect") }}
          </Button>
        </div>

        <p
          v-if="!linkable.length"
          class="py-2 text-center text-sm text-muted-foreground"
        >
          {{ t("account.noLinks") }}
        </p>
      </CardContent>
    </Card>
  </div>
</template>
