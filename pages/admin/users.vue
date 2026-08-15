<script setup lang="ts">
// Superadmin site settings → Users: all registered accounts.
definePageMeta({ layout: "default", middleware: "superadmin" });
const { t } = useI18n();
useHead({ title: () => t("admin.title") });

const users = ref<
  { id: string; name: string; email: string; verified: boolean; createdAt: string }[]
>([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const data = await $fetch<{ users: typeof users.value }>("/api/admin/users");
    users.value = data.users;
  } catch (e) {
    toast.error((e as Error).message);
  } finally {
    loading.value = false;
  }
});

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
</script>

<template>
  <SettingsShell
    :title="t('admin.title')"
    active="users"
    :sections="[
      { key: 'mail', label: t('admin.sections.mail'), to: '/admin/mail' },
      { key: 'users', label: t('admin.sections.users'), to: '/admin/users' },
    ]"
  >
    <div class="flex flex-col gap-4">
      <h3 class="text-base font-semibold">{{ t("admin.sections.users") }}</h3>
      <div v-if="loading" class="py-10 text-center text-sm text-muted-foreground">
        {{ t("settings.loading") }}
      </div>
      <div v-else class="overflow-x-auto rounded-lg border">
        <table class="w-full text-sm">
          <thead class="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th class="px-3 py-2 font-medium">{{ t("auth.register.nameLabel") }}</th>
              <th class="px-3 py-2 font-medium">{{ t("auth.login.emailLabel") }}</th>
              <th class="px-3 py-2 font-medium">{{ t("admin.users.verified") }}</th>
              <th class="px-3 py-2 text-right font-medium">{{ t("admin.users.joined") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id" class="border-t last:border-0 hover:bg-accent/30">
              <td class="px-3 py-2 font-medium">{{ u.name }}</td>
              <td class="px-3 py-2 text-muted-foreground">{{ u.email }}</td>
              <td class="px-3 py-2">
                <span
                  class="rounded-full border px-2 py-0.5 text-xs"
                  :class="u.verified ? 'border-emerald-500/40 text-emerald-600' : 'border-border text-muted-foreground'"
                >
                  {{ u.verified ? t("admin.users.verifiedYes") : t("admin.users.verifiedNo") }}
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
  </SettingsShell>
</template>
