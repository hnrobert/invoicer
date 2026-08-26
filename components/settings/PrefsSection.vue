<script setup lang="ts">
/**
 * Preferences section: theme + language as STAGED picks — changes apply only
 * on save via the shared SettingsSaveBar, and a leave guard prompts when
 * navigating away with unapplied picks. Component-local state means picks
 * reset whenever the section mounts (switching sections discards silently,
 * which the guard turns into an explicit prompt when dirty).
 */
import { useColorMode } from "@vueuse/core";

const { t } = useI18n();
const colorMode = useColorMode({ storageKey: "vg.theme" });
const { locale, locales, setLocale } = useI18n();
const localeList = computed(
  () => locales.value as { code: "zh" | "en"; name?: string }[],
);

const pickDark = ref(colorMode.value === "dark");
const pickLocale = ref<"zh" | "en">(locale.value as "zh" | "en");

const prefsDirty = computed(
  () =>
    pickDark.value !== (colorMode.value === "dark") ||
    pickLocale.value !== locale.value,
);
const saving = ref(false);
const savedFlash = ref(false);

function discardPrefs() {
  pickDark.value = colorMode.value === "dark";
  pickLocale.value = locale.value as "zh" | "en";
}
async function savePrefs() {
  saving.value = true;
  try {
    colorMode.value = pickDark.value ? "dark" : "light";
    if (pickLocale.value !== locale.value) await setLocale(pickLocale.value);
    savedFlash.value = true;
    setTimeout(() => (savedFlash.value = false), 2000);
  } finally {
    saving.value = false;
  }
}
const { confirmLeave, proceed } = useUnsavedLeaveGuard(prefsDirty, saving);
</script>

<template>
  <div class="flex flex-col gap-4">
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
            pickDark === (m === 'dark')
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="pickDark = m === 'dark'"
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
            pickLocale === l.code
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="pickLocale = l.code"
        >
          {{ t(`lang.${l.code}`) }}
        </button>
      </div>
    </div>

    <SettingsSaveBar
      :dirty="prefsDirty"
      :saving="saving"
      :saved="savedFlash"
      @save="savePrefs"
      @discard="discardPrefs"
    />
    <UnsavedLeaveDialog
      :open="confirmLeave"
      :saving="saving"
      @stay="confirmLeave = false"
      @discard="
        () => {
          discardPrefs();
          proceed();
        }
      "
      @save="
        async () => {
          await savePrefs();
          proceed();
        }
      "
    />
  </div>
</template>
