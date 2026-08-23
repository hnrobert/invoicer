<script setup lang="ts">
// OAuth return landing. Every social sign-in callbackURL points here:
//   success → refresh the session (+orgs), toast a welcome, continue to the
//   original destination;  error → a friendly, actionable message instead of
//   Better Auth's bare /api/auth/error HTML page (the auth forwarding layer
//   redirects those here with ?error=<code>).
definePageMeta({ layout: "auth" });
const { t } = useI18n();
useHead({ title: () => t("oauthCallback.title") });
const route = useRoute();
const { user, refreshUser } = useAuth();
const { refresh: refreshOrgs } = useOrgs();

const state = ref<"working" | "done" | "error">("working");
const errorCode = ref("");
const destination = ref("/");

const ERROR_KEYS = [
  "account_not_linked",
  "state_mismatch",
  "invalid_code",
  "access_denied",
  "expired_token",
  "user_cancelled",
] as const;

const errorMessage = computed(() => {
  const code = errorCode.value;
  if (code === "account_not_linked") return t("oauthCallback.errors.notLinked");
  if (code === "state_mismatch") return t("oauthCallback.errors.stateMismatch");
  if (code === "invalid_code" || code === "expired_token")
    return t("oauthCallback.errors.expired");
  if (code === "access_denied" || code === "user_cancelled")
    return t("oauthCallback.errors.denied");
  return t("oauthCallback.errors.generic");
});

onMounted(async () => {
  const redirect = route.query.redirect;
  destination.value =
    typeof redirect === "string" && redirect.startsWith("/") ? redirect : "/";

  const err = route.query.error;
  if (typeof err === "string" && err) {
    errorCode.value = err;
    state.value = "error";
    return;
  }

  // Success path: the session cookie is already set by the callback —
  // re-read it, then continue into the app.
  try {
    await refreshUser();
    if (user.value) {
      await refreshOrgs().catch(() => {});
      toast.success(t("oauthCallback.welcome", { name: user.value.name }));
      state.value = "done";
      navigateTo(destination.value, { replace: true });
    } else {
      // No session and no error code — treat as an unknown failure.
      errorCode.value = "unknown";
      state.value = "error";
    }
  } catch {
    errorCode.value = "unknown";
    state.value = "error";
  }
});
</script>

<template>
  <Card class="mx-auto w-full max-w-sm">
    <CardContent class="flex flex-col items-center gap-4 py-10 text-center">
      <template v-if="state === 'working' || state === 'done'">
        <Icon
          spec="LoaderCircle"
          :size="28"
          class="animate-spin text-muted-foreground"
        />
        <p class="text-sm text-muted-foreground">
          {{ t("oauthCallback.working") }}
        </p>
      </template>
      <template v-else>
        <Icon spec="ShieldAlert" :size="28" class="text-muted-foreground" />
        <h1 class="text-base font-semibold">{{ t("oauthCallback.failed") }}</h1>
        <p class="text-sm text-muted-foreground">{{ errorMessage }}</p>
        <p
          v-if="errorCode === 'account_not_linked'"
          class="text-xs text-muted-foreground"
        >
          {{ t("oauthCallback.notLinkedHint") }}
        </p>
        <div class="mt-2 flex gap-2">
          <Button variant="outline" size="sm" @click="navigateTo('/login')">
            <Icon spec="LogIn" :size="14" />
            {{ t("auth.user.login") }}
          </Button>
          <Button
            v-if="user"
            variant="outline"
            size="sm"
            @click="navigateTo('/settings?section=security')"
          >
            <Icon spec="Settings" :size="14" />
            {{ t("settings.title") }}
          </Button>
        </div>
      </template>
    </CardContent>
  </Card>
</template>
