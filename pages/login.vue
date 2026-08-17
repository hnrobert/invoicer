<script setup lang="ts">
import type { ProviderId } from "~/composables/useAuth";

definePageMeta({ layout: "auth", middleware: "guest" });

const { t } = useI18n();
const route = useRoute();
const { signInEmail, signInSocial } = useAuth();
const { list: providerList } = useOAuthProviders();

const email = ref("");
const password = ref("");
const loading = ref(false);

async function onSubmit() {
  loading.value = true;
  try {
    await signInEmail(email.value.trim(), password.value);
    await navigateTo((route.query.redirect as string) || "/");
  } catch (e) {
    toast.error(messageFromError(e, t("auth.login.failed")));
  } finally {
    loading.value = false;
  }
}

async function onOAuth(provider: ProviderId) {
  try {
    // Continue to the originally requested page after the OAuth round-trip.
    const redirect = route.query.redirect;
    await signInSocial(
      provider,
      typeof redirect === "string" && redirect.startsWith("/") ? redirect : "/",
    );
  } catch (e) {
    toast.error(messageFromError(e, t("auth.oauth.failed")));
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>{{ t("auth.login.title") }}</CardTitle>
      <CardDescription>{{ t("auth.login.desc") }}</CardDescription>
    </CardHeader>
    <CardContent>
      <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
        <div class="flex flex-col gap-2">
          <Label for="email">{{ t("auth.login.emailLabel") }}</Label>
          <Input
            id="email"
            v-model="email"
            type="email"
            placeholder="you@example.com"
            autocomplete="email"
            :disabled="loading"
          />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="password">{{ t("auth.login.passwordLabel") }}</Label>
          <Input
            id="password"
            v-model="password"
            type="password"
            placeholder="••••••••"
            autocomplete="current-password"
            :disabled="loading"
          />
        </div>
        <Button type="submit" :disabled="loading" class="mt-1">
          {{ loading ? t("auth.login.submitting") : t("auth.login.submit") }}
        </Button>

        <template v-if="providerList.length">
          <div class="relative my-1">
            <div class="absolute inset-0 flex items-center">
              <span class="w-full border-t" />
            </div>
            <div class="relative flex justify-center text-xs uppercase">
              <span class="bg-card px-2 text-muted-foreground">{{
                t("auth.oauth.or")
              }}</span>
            </div>
          </div>
          <Button
            v-for="provider in providerList"
            :key="provider"
            type="button"
            variant="outline"
            @click="onOAuth(provider)"
          >
            <Icon
              :spec="provider === 'github' ? 'Github' : 'MessageCircle'"
              :size="16"
            />
            {{
              provider === "github"
                ? t("auth.oauth.github")
                : t("auth.oauth.wechat")
            }}
          </Button>
        </template>
      </form>
    </CardContent>
    <CardFooter class="justify-center text-sm text-muted-foreground">
      {{ t("auth.login.noAccount") }}
      <NuxtLink
        to="/register"
        class="ml-1 font-medium text-foreground underline hover:opacity-70"
        >{{ t("auth.login.registerLink") }}</NuxtLink
      >
    </CardFooter>
  </Card>
</template>
