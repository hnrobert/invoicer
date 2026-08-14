<script setup lang="ts">
import type { MailConfigClient } from "~/composables/useInvoice";

definePageMeta({ layout: "default" });
const { t } = useI18n();
useHead({ title: () => t("settings.title") });

const loading = ref(true);
const saving = ref(false);
const testing = ref(false);

// form state — mirror MailConfigInput
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

const testTo = ref("");

function applyConfig(c: MailConfigClient | null) {
  if (!c) return;
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
  if (!smtpServer.value.trim()) {
    toast.error(t("settings.needServer"));
    return;
  }
  if (usePassword.value && !senderEmail.value.trim()) {
    toast.error(t("settings.needSender"));
    return;
  }
  saving.value = true;
  try {
    const body: Record<string, unknown> = {
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
    };
    if (senderPassword.value) body.senderPassword = senderPassword.value;
    const data = await $fetch<{ config: MailConfigClient | null }>(
      "/api/mail/config",
      {
        method: "POST",
        body,
      },
    );
    applyConfig(data.config);
    senderPassword.value = "";
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
      <NuxtLink to="/" class="hover:text-foreground"
        ><Icon spec="ArrowLeft" :size="14" /> {{ t("settings.back") }}</NuxtLink
      >
      <span>/</span>
      <span class="text-foreground">{{ t("settings.title") }}</span>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>{{ t("settings.smtpTitle") }}</CardTitle>
        <CardDescription>{{ t("settings.smtpDesc") }}</CardDescription>
      </CardHeader>
      <CardContent
        v-if="loading"
        class="py-10 text-center text-sm text-muted-foreground"
        >{{ t("settings.loading") }}</CardContent
      >
      <CardContent v-else class="flex flex-col gap-5">
        <!-- SMTP -->
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
            <Input v-model.number="smtpPort" type="number" placeholder="465" />
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-5 text-sm">
          <label class="flex items-center gap-2">
            <input
              v-model="useSsl"
              type="checkbox"
              class="size-4 accent-(--color-primary,#F7D447)"
            />
            <span>{{ t("settings.ssl") }}</span>
          </label>
          <label class="flex items-center gap-2">
            <input
              v-model="useTls"
              type="checkbox"
              class="size-4 accent-(--color-primary,#F7D447)"
            />
            <span>{{ t("settings.starttls") }}</span>
          </label>
          <label class="flex items-center gap-2">
            <input
              v-model="usePassword"
              type="checkbox"
              class="size-4 accent-(--color-primary,#F7D447)"
            />
            <span>{{ t("settings.usePassword") }}</span>
          </label>
        </div>

        <!-- Sender -->
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

        <!-- Limits -->
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
