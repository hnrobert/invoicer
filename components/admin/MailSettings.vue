<!-- Mail delivery settings (SMTP / POST webhook) — the /admin/mail section. -->
<script setup lang="ts">
import type { MailConfigClient } from "~/composables/useInvoice";
import {
  MailInterfaceEditor,
  useSchemaStore,
  DEFAULT_SCHEMAS,
  type PostSchema,
  type UseSchemaStoreResult,
} from "email-poster/vue";
import { PRESETS, type FieldMap } from "email-poster/pure";

const { t } = useI18n();

const loading = ref(true);
const saving = ref(false);
const testing = ref(false);

// form state — mirrors MailConfigInput
const provider = ref<"smtp" | "post">("smtp");
const smtpServer = ref("");
const smtpPort = ref(465);
const useSsl = ref(true);
const useTls = ref(false);
const usePassword = ref(true);
const senderEmail = ref("");
const senderEmailDisplay = ref("");
const senderDomain = ref("");
const senderPassword = ref(""); // only sent when non-empty
const hasPassword = ref(false);
const maxLenRecipientEmail = ref(200);
const maxLenSubject = ref(200);
const maxLenBody = ref(2000);

// POST webhook state
const postUrl = ref("");
const postAuthToken = ref(""); // only sent when non-empty
const hasPostAuthToken = ref(false);
const fieldMap = ref<FieldMap>({});
// Created after the config loads (storage adapter reads the fetched row);
// MailInterfaceEditor is rendered only once it exists. shallowRef so the
// store's own nested refs are not unwrapped by a deep reactive() proxy.
const schemaStore = shallowRef<UseSchemaStoreResult | null>(null);

/** The active format maps a `from` logical field — the sender address is required. */
const needsFrom = computed(() => "from" in fieldMap.value);

const testTo = ref("");

const providers = ["smtp", "post"] as const;

/** Effective FieldMap for a config: stored postFieldMap wins, else the legacy preset migration. */
function effectiveFieldMap(c: MailConfigClient): FieldMap {
  const raw = c.postFieldMap?.trim();
  if (raw) {
    try {
      return JSON.parse(raw) as FieldMap;
    } catch {
      // fall through to preset migration
    }
  }
  return c.postSchema === "powerautomate"
    ? PRESETS.custom_example
    : PRESETS.smtogo;
}

/**
 * Schema library backed by the server: loads from the stored `postSchemas`
 * row, persists (debounced) via PUT /api/mail/post-schemas so it is shared
 * across browsers rather than localStorage.
 */
function makeSchemaStore(c: MailConfigClient): UseSchemaStoreResult {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return useSchemaStore({
    defaults: DEFAULT_SCHEMAS,
    storage: {
      load: () => {
        const raw = c.postSchemas?.trim();
        if (!raw) return undefined;
        try {
          return JSON.parse(raw) as PostSchema[];
        } catch {
          return undefined;
        }
      },
      save: (schemas) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          void $fetch("/api/mail/post-schemas", {
            method: "PUT",
            body: { schemas },
          }).catch(() => {
            toast.error(t("settings.schemasSaveFailed"));
          });
        }, 800);
      },
    },
  });
}

function applyConfig(c: MailConfigClient | null) {
  if (!c) return;
  provider.value = c.provider === "post" ? "post" : "smtp";
  smtpServer.value = c.smtpServer;
  smtpPort.value = c.smtpPort;
  useSsl.value = c.useSsl;
  useTls.value = c.useTls;
  usePassword.value = c.usePassword;
  senderEmail.value = c.senderEmail;
  senderEmailDisplay.value = c.senderEmailDisplay;
  senderDomain.value = c.senderDomain;
  hasPassword.value = c.hasPassword;
  maxLenRecipientEmail.value = c.maxLenRecipientEmail;
  maxLenSubject.value = c.maxLenSubject;
  maxLenBody.value = c.maxLenBody;
  postUrl.value = c.postUrl;
  hasPostAuthToken.value = c.hasPostAuthToken;
  fieldMap.value = effectiveFieldMap(c);
  schemaStore.value = makeSchemaStore(c);
}

async function load() {
  loading.value = true;
  try {
    const data = await $fetch<{ config: MailConfigClient | null }>(
      "/api/mail/config",
    );
    applyConfig(data.config);
  } catch (e) {
    toast.error(t("settings.loadFailed") + (e as Error).message);
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (provider.value === "smtp" && !smtpServer.value.trim()) {
    toast.error(t("settings.needServer"));
    return;
  }
  if (
    provider.value === "smtp" &&
    usePassword.value &&
    !senderEmail.value.trim()
  ) {
    toast.error(t("settings.needSender"));
    return;
  }
  if (provider.value === "post" && !postUrl.value.trim()) {
    toast.error(t("settings.needPostUrl"));
    return;
  }
  saving.value = true;
  try {
    const body: Record<string, unknown> = {
      provider: provider.value,
      smtpServer: smtpServer.value.trim(),
      smtpPort: Number(smtpPort.value),
      useSsl: useSsl.value,
      useTls: useTls.value,
      usePassword: usePassword.value,
      senderEmail: senderEmail.value.trim(),
      senderEmailDisplay: senderEmailDisplay.value.trim(),
      senderDomain: senderDomain.value.trim(),
      maxLenRecipientEmail: Number(maxLenRecipientEmail.value),
      maxLenSubject: Number(maxLenSubject.value),
      maxLenBody: Number(maxLenBody.value),
      postUrl: postUrl.value.trim(),
      postSchema: "smtogo", // legacy discriminator; postFieldMap is authoritative
      postFieldMap: JSON.stringify(fieldMap.value),
    };
    if (senderPassword.value) body.senderPassword = senderPassword.value;
    if (postAuthToken.value) body.postAuthToken = postAuthToken.value;
    const data = await $fetch<{ config: MailConfigClient | null }>(
      "/api/mail/config",
      {
        method: "POST",
        body,
      },
    );
    // Refresh flags without rebuilding the editor (its state is already current).
    hasPassword.value = !!data.config?.hasPassword;
    hasPostAuthToken.value = !!data.config?.hasPostAuthToken;
    senderPassword.value = "";
    postAuthToken.value = "";
    toast.success(t("settings.saved"));
  } catch (e) {
    toast.error(t("settings.saveFailed") + (e as Error).message);
  } finally {
    saving.value = false;
  }
}

async function testSend() {
  if (!testTo.value.trim()) {
    toast.error(t("settings.needTestTo"));
    return;
  }
  testing.value = true;
  try {
    await $fetch("/api/mail/test", {
      method: "POST",
      body: { to: testTo.value.trim() },
    });
    toast.success(t("settings.testSent"));
  } catch (e) {
    toast.error(t("settings.testFailed") + (e as Error).message);
  } finally {
    testing.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-center gap-2 text-sm text-muted-foreground">
      <NuxtLink
        to="/"
        class="inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground"
        ><Icon spec="ArrowLeft" :size="14" /> {{ t("settings.back") }}</NuxtLink
      >
      <span>/</span>
      <span class="text-foreground">{{ t("settings.title") }}</span>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>{{ t("settings.title") }}</CardTitle>
        <CardDescription>{{ t("settings.desc") }}</CardDescription>
      </CardHeader>
      <CardContent
        v-if="loading"
        class="py-10 text-center text-sm text-muted-foreground"
        >{{ t("settings.loading") }}</CardContent
      >
      <CardContent v-else class="flex flex-col gap-5">
        <!-- provider toggle -->
        <div class="inline-flex w-fit rounded-lg border p-1">
          <button
            v-for="p in providers"
            :key="p"
            type="button"
            class="rounded-md px-4 py-1.5 text-sm font-medium transition-colors"
            :class="
              provider === p
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            "
            @click="provider = p"
          >
            {{ t(`settings.provider.${p}`) }}
          </button>
        </div>

        <!-- SMTP -->
        <template v-if="provider === 'smtp'">
          <p class="text-sm text-muted-foreground">
            {{ t("settings.smtpDesc") }}
          </p>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-2">
              <Label>{{ t("settings.serverLabel") }}</Label>
              <Input
                v-model="smtpServer"
                :placeholder="t('settings.serverPlaceholder')"
              />
            </div>
            <div class="flex flex-col gap-2">
              <Label>{{ t("settings.portLabel") }}</Label>
              <Input
                v-model.number="smtpPort"
                type="number"
                placeholder="465"
              />
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-5 text-sm">
            <label class="flex items-center gap-2">
              <input
                v-model="useSsl"
                type="checkbox"
                class="size-4 accent-(--color-primary)"
              />
              <span>{{ t("settings.ssl") }}</span>
            </label>
            <label class="flex items-center gap-2">
              <input
                v-model="useTls"
                type="checkbox"
                class="size-4 accent-(--color-primary)"
              />
              <span>{{ t("settings.starttls") }}</span>
            </label>
            <label class="flex items-center gap-2">
              <input
                v-model="usePassword"
                type="checkbox"
                class="size-4 accent-(--color-primary)"
              />
              <span>{{ t("settings.usePassword") }}</span>
            </label>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-2">
              <Label>{{ t("settings.senderLabel") }}</Label>
              <Input
                v-model="senderEmail"
                :disabled="!usePassword"
                :placeholder="t('settings.senderPlaceholder')"
              />
            </div>
            <div class="flex flex-col gap-2">
              <Label>{{ t("settings.displayLabel") }}</Label>
              <Input
                v-model="senderEmailDisplay"
                :placeholder="t('settings.displayPlaceholder')"
              />
            </div>
            <div class="flex flex-col gap-2">
              <Label>{{ t("settings.passwordLabel") }}</Label>
              <Input
                v-model="senderPassword"
                type="password"
                :disabled="!usePassword"
                :placeholder="
                  hasPassword
                    ? t('settings.passwordPlaceholderSet')
                    : t('settings.passwordPlaceholderEmpty')
                "
              />
            </div>
            <div class="flex flex-col gap-2">
              <Label>{{ t("settings.domainLabel") }}</Label>
              <Input
                v-model="senderDomain"
                :placeholder="t('settings.domainPlaceholder')"
              />
            </div>
          </div>
        </template>

        <!-- POST webhook -->
        <template v-else>
          <p class="text-sm text-muted-foreground">
            {{ t("settings.postDesc") }}
          </p>
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-2">
              <Label>{{ t("settings.postUrlLabel") }}</Label>
              <Input
                v-model="postUrl"
                :placeholder="t('settings.postUrlPlaceholder')"
              />
            </div>
            <div class="flex flex-col gap-2">
              <Label>{{ t("settings.postTokenLabel") }}</Label>
              <Input
                v-model="postAuthToken"
                type="password"
                :placeholder="
                  hasPostAuthToken
                    ? t('settings.passwordPlaceholderSet')
                    : t('settings.postTokenPlaceholderEmpty')
                "
              />
            </div>
          </div>

          <!-- sender address only needed when the active format maps `from` -->
          <div v-if="needsFrom" class="grid gap-4 sm:grid-cols-2">
            <div class="flex flex-col gap-2">
              <Label>{{ t("settings.senderLabel") }}</Label>
              <Input
                v-model="senderEmail"
                :placeholder="t('settings.senderPlaceholder')"
              />
            </div>
            <div class="flex flex-col gap-2">
              <Label>{{ t("settings.displayLabel") }}</Label>
              <Input
                v-model="senderEmailDisplay"
                :placeholder="t('settings.displayPlaceholder')"
              />
            </div>
          </div>

          <!-- email-poster built-in visual editor for the POST payload format -->
          <div class="flex flex-col gap-2">
            <div>
              <h3 class="text-sm font-medium">
                {{ t("settings.editorTitle") }}
              </h3>
              <p class="text-xs text-muted-foreground">
                {{ t("settings.editorDesc") }}
              </p>
            </div>
            <MailInterfaceEditor
              v-if="schemaStore"
              v-model="fieldMap"
              :schema-store="schemaStore"
              @error="(e) => toast.error(e.message)"
              @detected="(e) => toast.success(e.message)"
              @imported="(e) => toast.success(e.message)"
              @success="(e) => toast.success(e.message)"
            />
          </div>
        </template>

        <!-- Limits (shared by both providers) -->
        <details class="rounded-lg border p-3 text-sm">
          <summary class="cursor-pointer font-medium">
            {{ t("settings.limitsTitle") }}
          </summary>
          <div class="mt-3 grid gap-4 sm:grid-cols-3">
            <div class="flex flex-col gap-2">
              <Label>{{ t("settings.maxRecipient") }}</Label>
              <Input v-model.number="maxLenRecipientEmail" type="number" />
            </div>
            <div class="flex flex-col gap-2">
              <Label>{{ t("settings.maxSubject") }}</Label>
              <Input v-model.number="maxLenSubject" type="number" />
            </div>
            <div class="flex flex-col gap-2">
              <Label>{{ t("settings.maxBody") }}</Label>
              <Input v-model.number="maxLenBody" type="number" />
            </div>
          </div>
        </details>

        <div class="flex flex-wrap gap-2">
          <Button :disabled="saving" @click="save">
            <Icon spec="Save" :size="16" />
            {{ saving ? t("settings.saving") : t("settings.save") }}
          </Button>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>{{ t("settings.testTitle") }}</CardTitle>
        <CardDescription>{{ t("settings.testDesc") }}</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div class="flex flex-1 flex-col gap-2">
          <Label>{{ t("settings.testToLabel") }}</Label>
          <Input v-model="testTo" type="email" placeholder="you@example.com" />
        </div>
        <Button :disabled="testing" variant="outline" @click="testSend">
          <Icon spec="Send" :size="16" />
          {{ testing ? t("settings.testing") : t("settings.testSend") }}
        </Button>
      </CardContent>
    </Card>
  </div>
</template>
