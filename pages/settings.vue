<script setup lang="ts">
// Unified user Settings hub (GitHub-style sectioned): Profile / Emails /
// Preferences / Linked providers for every user, plus an Admin group
// (Mail delivery / Users) rendered only for superadmins — the underlying
// endpoints enforce the same rule server-side.
import type { PasskeyInfo, ProviderId } from "~/composables/useAuth";
import { useColorMode } from "@vueuse/core";

definePageMeta({ layout: "default" });
const { t } = useI18n();
useHead({ title: () => t("settings.title") });
const route = useRoute();

const ALL = [
  "profile",
  "emails",
  "preferences",
  "security",
  "mail",
  "users",
] as const;
const section = computed<(typeof ALL)[number]>(() =>
  (ALL as readonly string[]).includes(String(route.query.section))
    ? (route.query.section as (typeof ALL)[number])
    : "profile",
);
const secUrl = (key: string) => ({
  path: "/settings",
  query: { section: key },
});

const {
  user,
  isAdmin,
  linkProvider,
  unlinkProvider,
  listAccounts,
  refreshUser,
  changePassword,
  listPasskeys,
  addPasskey,
  removePasskey,
} = useAuth();
const { list: enabledList } = useOAuthProviders();

// ---------- security: change password ----------
const currentPw = ref("");
const newPw = ref("");
const confirmPw = ref("");
const pwBusy = ref(false);
/** True when the account has an email+password credential (OAuth-only accounts can't change a password). */
const hasPasswordAccount = computed(() =>
  accounts.value.some((a) => a.providerId === "credential"),
);
async function submitChangePassword() {
  if (newPw.value.length < 8) {
    toast.error(t("auth.register.passwordHint"));
    return;
  }
  if (newPw.value !== confirmPw.value) {
    toast.error(t("auth.register.passwordMismatch"));
    return;
  }
  pwBusy.value = true;
  try {
    await changePassword(currentPw.value, newPw.value);
    currentPw.value = "";
    newPw.value = "";
    confirmPw.value = "";
    toast.success(t("settings.security.pwChanged"));
  } catch (e) {
    toast.error(messageFromError(e, t("settings.security.pwFailed")));
  } finally {
    pwBusy.value = false;
  }
}

// ---------- profile ----------
// The username is chosen at sign-up; the primary email is managed under Emails.

// ---------- emails ----------
const emails = ref<{ email: string; primary: boolean; verified: boolean }[]>(
  [],
);
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
    toast.success(t("account.emails.verifySent"));
  } catch (e) {
    toast.error((e as Error).message);
  } finally {
    emailBusy.value = false;
  }
}
async function resendVerification(email: string) {
  try {
    const data = await $fetch<{ emails: typeof emails.value }>(
      "/api/account/emails/resend",
      { method: "POST", body: { email } },
    );
    emails.value = data.emails;
    toast.success(t("account.emails.verifySent"));
  } catch (e) {
    toast.error((e as Error).message);
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
    await refreshUser();
  } catch (e) {
    toast.error((e as Error).message);
  }
}

// ---------- preferences ----------
const colorMode = useColorMode({ storageKey: "vg.theme" });
const { locale, locales, setLocale } = useI18n();
const localeList = computed(
  () => locales.value as { code: "zh" | "en"; name?: string }[],
);

// ---------- security: passkeys ----------
const passkeys = ref<PasskeyInfo[]>([]);
const pkBusy = ref(false);
async function refreshPasskeys() {
  try {
    passkeys.value = await listPasskeys();
  } catch {
    passkeys.value = [];
  }
}
async function onAddPasskey() {
  pkBusy.value = true;
  try {
    passkeys.value = await addPasskey();
    toast.success(t("settings.passkey.added"));
  } catch (e) {
    toast.error(messageFromError(e, t("settings.passkey.failed")));
  } finally {
    pkBusy.value = false;
  }
}
async function onRemovePasskey(id: number) {
  try {
    passkeys.value = await removePasskey(id);
  } catch (e) {
    toast.error(messageFromError(e, t("settings.passkey.removeFailed")));
  }
}
function fmtPkDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

// ---------- linked providers ----------
const accounts = ref<
  Array<{ id: string; providerId: string; accountId: string }>
>([]);
const linkable = computed<ProviderId[]>(() => enabledList.value);
function isLinked(provider: ProviderId) {
  return accounts.value.some((a) => a.providerId === provider);
}
async function refreshAccounts() {
  try {
    accounts.value = await listAccounts();
  } catch (e) {
    toast.error(messageFromError(e, t("account.loadFailed")));
  }
}
async function onConnect(provider: ProviderId) {
  try {
    await linkProvider(provider);
  } catch (e) {
    toast.error(messageFromError(e, t("account.connectFailed")));
  }
}
async function onDisconnect(provider: ProviderId) {
  try {
    await unlinkProvider(provider);
    toast.success(t("account.disconnected"));
    await refreshAccounts();
  } catch (e) {
    toast.error(messageFromError(e, t("account.disconnectFailed")));
  }
}

// ---------- admin: users ----------
const users = ref<
  {
    id: string;
    name: string;
    email: string;
    verified: boolean;
    createdAt: string;
  }[]
>([]);
const usersLoading = ref(false);
async function loadUsers() {
  usersLoading.value = true;
  try {
    const data = await $fetch<{ users: typeof users.value }>(
      "/api/admin/users",
    );
    users.value = data.users;
  } catch (e) {
    toast.error((e as Error).message);
  } finally {
    usersLoading.value = false;
  }
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

const sections = computed(() => [
  {
    key: "profile",
    label: t("settings.sections.profile"),
    to: secUrl("profile"),
    icon: "IdCard",
  },
  {
    key: "emails",
    label: t("account.emails.title"),
    to: secUrl("emails"),
    icon: "Mail",
  },
  {
    key: "preferences",
    label: t("account.prefsTitle"),
    to: secUrl("preferences"),
    icon: "SlidersHorizontal",
  },
  {
    key: "security",
    label: t("settings.sections.security"),
    to: secUrl("security"),
    icon: "ShieldCheck",
  },
  ...(isAdmin.value
    ? [
        { key: "adminGroup", label: t("settings.sections.admin"), to: null },
        {
          key: "mail",
          label: t("admin.sections.mail"),
          to: secUrl("mail"),
          icon: "Send",
        },
        {
          key: "users",
          label: t("admin.sections.users"),
          to: secUrl("users"),
          icon: "Users",
        },
      ]
    : []),
]);

onMounted(() => {
  // Verification link landing: /settings?section=emails&verified=1|0
  const v = route.query.verified;
  if (typeof v === "string") {
    if (v === "1") toast.success(t("account.emails.verifyOk"));
    else toast.error(t("account.emails.verifyBad"));
    navigateTo(
      { path: "/settings", query: { section: "emails" } },
      { replace: true },
    );
  }
  void refreshPasskeys();
  void refreshEmails();
  void refreshAccounts();
  if (section.value === "users" && isAdmin.value) void loadUsers();
});
watch(section, (v) => {
  if (v === "users" && isAdmin.value && !users.value.length) void loadUsers();
});
</script>

<template>
  <SettingsShell
    :title="t('settings.title')"
    :active="section"
    :sections="sections"
  >
    <!-- ============ profile ============ -->
    <div v-if="section === 'profile'" class="flex flex-col gap-4">
      <h3 class="text-base font-semibold">
        {{ t("settings.sections.profile") }}
      </h3>
      <div class="flex items-center gap-3 rounded-lg border p-3 text-sm">
        <span
          class="flex size-12 shrink-0 items-center justify-center rounded-full border bg-muted text-base font-semibold"
          >{{ (user?.name || "?")[0]?.toUpperCase() }}</span
        >
        <div class="min-w-0">
          <div class="truncate font-medium">{{ user?.name || "—" }}</div>
          <div class="truncate text-xs text-muted-foreground">
            {{ user?.email || "—" }}
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <span class="w-20 shrink-0 text-muted-foreground">{{
          t("auth.register.nameLabel")
        }}</span>
        <span class="font-medium">{{ user?.name || "—" }}</span>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <span class="w-20 shrink-0 text-muted-foreground">{{
          t("auth.login.emailLabel")
        }}</span>
        <span class="font-medium">{{ user?.email || "—" }}</span>
      </div>
      <p class="text-xs text-muted-foreground">
        {{ t("settings.sections.profileHint") }}
      </p>
    </div>

    <!-- ============ emails ============ -->
    <div v-else-if="section === 'emails'" class="flex flex-col gap-3">
      <h3 class="text-base font-semibold">{{ t("account.emails.title") }}</h3>
      <p class="text-sm text-muted-foreground">
        {{ t("account.emails.desc") }}
      </p>
      <div
        v-for="e in emails"
        :key="e.email"
        class="flex flex-wrap items-center gap-2 rounded-lg border p-3 sm:gap-3"
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
        <span
          v-else-if="e.verified"
          class="rounded-full border border-emerald-500/40 px-2 py-0.5 text-xs text-emerald-600"
          >{{ t("account.emails.verifiedTag") }}</span
        >
        <span
          v-else
          class="rounded-full border border-amber-500/40 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400"
          >{{ t("account.emails.unverifiedTag") }}</span
        >
        <template v-if="!e.primary">
          <Button
            v-if="e.verified"
            variant="outline"
            size="sm"
            @click="makePrimary(e.email)"
          >
            {{ t("account.emails.makePrimary") }}
          </Button>
          <Button
            v-else
            variant="outline"
            size="sm"
            @click="resendVerification(e.email)"
          >
            {{ t("account.emails.resend") }}
          </Button>
          <Button variant="ghost" size="sm" @click="removeEmail(e.email)">
            {{ t("account.emails.remove") }}
          </Button>
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
    </div>

    <!-- ============ preferences ============ -->
    <div v-else-if="section === 'preferences'" class="flex flex-col gap-4">
      <h3 class="text-base font-semibold">{{ t("account.prefsTitle") }}</h3>
      <p class="text-sm text-muted-foreground">{{ t("account.prefsDesc") }}</p>
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
    </div>

    <!-- ============ security: password + linked providers ============ -->
    <div v-else-if="section === 'security'" class="flex flex-col gap-6">
      <!-- change password -->
      <div class="flex flex-col gap-3">
        <h3 class="text-base font-semibold">
          {{ t("settings.security.title") }}
        </h3>
        <p class="text-sm text-muted-foreground">
          {{ t("settings.security.desc") }}
        </p>
        <p
          v-if="!hasPasswordAccount"
          class="rounded-lg border border-dashed p-3 text-sm text-muted-foreground"
        >
          {{ t("settings.security.noPassword") }}
        </p>
        <form
          v-else
          class="flex max-w-md flex-col gap-3"
          @submit.prevent="submitChangePassword"
        >
          <div class="flex flex-col gap-2">
            <Label>{{ t("settings.security.currentPw") }}</Label>
            <Input
              v-model="currentPw"
              type="password"
              required
              autocomplete="current-password"
            />
          </div>
          <div class="flex flex-col gap-2">
            <Label>{{ t("settings.security.newPw") }}</Label>
            <Input
              v-model="newPw"
              type="password"
              required
              minlength="8"
              autocomplete="new-password"
            />
            <p class="text-xs text-muted-foreground">
              {{ t("auth.register.passwordHint") }}
            </p>
          </div>
          <div class="flex flex-col gap-2">
            <Label>{{ t("auth.register.confirmLabel") }}</Label>
            <Input
              v-model="confirmPw"
              type="password"
              required
              minlength="8"
              autocomplete="new-password"
            />
          </div>
          <Button type="submit" :disabled="pwBusy" class="self-start">
            <Icon spec="KeyRound" :size="14" />
            {{ pwBusy ? t("settings.saving") : t("settings.security.submit") }}
          </Button>
        </form>
      </div>

      <!-- passkeys -->
      <div class="flex flex-col gap-3 border-t pt-5">
        <h3 class="text-base font-semibold">
          {{ t("settings.passkey.title") }}
        </h3>
        <p class="text-sm text-muted-foreground">
          {{ t("settings.passkey.desc") }}
        </p>
        <div
          v-for="pk in passkeys"
          :key="pk.id"
          class="flex items-center gap-3 rounded-lg border p-3"
        >
          <Icon spec="Fingerprint" :size="18" class="text-muted-foreground" />
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium">
              {{
                pk.deviceType === "multiDevice"
                  ? t("settings.passkey.multiDevice")
                  : t("settings.passkey.singleDevice")
              }}
              <span
                v-if="pk.backedUp"
                class="ml-1 text-xs text-muted-foreground"
              >
                · {{ t("settings.passkey.synced") }}
              </span>
            </div>
            <div class="text-xs text-muted-foreground">
              {{ fmtPkDate(pk.createdAt) }}
            </div>
          </div>
          <Button variant="ghost" size="sm" @click="onRemovePasskey(pk.id)">
            {{ t("account.emails.remove") }}
          </Button>
        </div>
        <p v-if="!passkeys.length" class="text-xs text-muted-foreground">
          {{ t("settings.passkey.none") }}
        </p>
        <Button
          variant="outline"
          size="sm"
          :disabled="pkBusy"
          class="self-start"
          @click="onAddPasskey"
        >
          <Icon spec="KeyRound" :size="14" />
          {{ pkBusy ? t("settings.loading") : t("settings.passkey.add") }}
        </Button>
      </div>

      <!-- linked providers -->
      <div class="flex flex-col gap-3 border-t pt-5">
        <h3 class="text-base font-semibold">{{ t("account.linkedTitle") }}</h3>
        <p class="text-sm text-muted-foreground">
          {{ t("account.linkedDesc") }}
        </p>
        <div
          v-if="hasPasswordAccount"
          class="flex items-center gap-3 rounded-lg border p-3"
        >
          <Icon spec="Mail" :size="18" class="text-muted-foreground" />
          <span class="text-sm font-medium">{{
            t("account.emailPassword")
          }}</span>
          <span
            class="ml-auto rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground"
            >{{ t("settings.security.linkedTag") }}</span
          >
        </div>
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
          v-if="!linkable.length && !hasPasswordAccount"
          class="py-2 text-center text-sm text-muted-foreground"
        >
          {{ t("account.noLinks") }}
        </p>
      </div>
    </div>

    <!-- ============ admin: mail ============ -->
    <div v-else-if="section === 'mail' && isAdmin">
      <MailSettings />
    </div>

    <!-- ============ admin: users ============ -->
    <div v-else-if="section === 'users' && isAdmin" class="flex flex-col gap-3">
      <h3 class="text-base font-semibold">{{ t("admin.sections.users") }}</h3>
      <div
        v-if="usersLoading"
        class="py-10 text-center text-sm text-muted-foreground"
      >
        {{ t("settings.loading") }}
      </div>
      <div v-else class="overflow-x-auto rounded-lg border">
        <table class="w-full text-sm">
          <thead class="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th class="px-3 py-2 font-medium">
                {{ t("auth.register.nameLabel") }}
              </th>
              <th class="px-3 py-2 font-medium">
                {{ t("auth.login.emailLabel") }}
              </th>
              <th class="px-3 py-2 font-medium">
                {{ t("admin.users.verified") }}
              </th>
              <th class="px-3 py-2 text-right font-medium">
                {{ t("admin.users.joined") }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="u in users"
              :key="u.id"
              class="border-t last:border-0 hover:bg-accent/30"
            >
              <td class="px-3 py-2 font-medium">{{ u.name }}</td>
              <td class="px-3 py-2 text-muted-foreground">{{ u.email }}</td>
              <td class="px-3 py-2">
                <span
                  class="rounded-full border px-2 py-0.5 text-xs"
                  :class="
                    u.verified
                      ? 'border-emerald-500/40 text-emerald-600'
                      : 'border-border text-muted-foreground'
                  "
                >
                  {{
                    u.verified
                      ? t("admin.users.verifiedYes")
                      : t("admin.users.verifiedNo")
                  }}
                </span>
              </td>
              <td class="px-3 py-2 text-right text-xs text-muted-foreground">
                {{ fmtDate(u.createdAt) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- admin section requested by a non-admin -->
    <div
      v-else-if="section === 'mail' || section === 'users'"
      class="py-16 text-center text-sm text-muted-foreground"
    >
      <Icon
        spec="ShieldAlert"
        :size="28"
        class="mx-auto mb-3 text-muted-foreground"
      />
      {{ t("admin.deniedDesc") }}
    </div>
  </SettingsShell>
</template>
