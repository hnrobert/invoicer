<script setup lang="ts">
import type { ProviderId } from "~/composables/useAuth";

// Auth is enforced by the global auth.global.ts middleware; /account is not in
// its PUBLIC allowlist, so it is protected without a per-page middleware name.
const { t } = useI18n();
const { user, linkProvider, unlinkProvider, listAccounts } = useAuth();
const { list: enabledList } = useOAuthProviders();

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
