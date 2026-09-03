<script setup lang="ts">
// Superadmin user management: sortable + searchable table with full CRUD.
// List data is flat (AdminUserPublic); the detail dialog lazily loads the
// rich profile (providers / passkeys / orgs / counts) per user.
import type { AdminUserDetailResponse, AdminUserPublic } from "#shared/api";

const { t } = useI18n();
const { user: me } = useAuth();

const users = ref<AdminUserPublic[]>([]);
const loading = ref(false);
const q = ref("");
const sortKey = ref<"name" | "email" | "createdAt">("createdAt");
const sortAsc = ref(false);

async function load() {
  loading.value = true;
  try {
    const data = await $fetch<{ users: AdminUserPublic[] }>("/api/admin/users");
    users.value = data.users;
  } catch (e) {
    toast.error((e as Error).message);
  } finally {
    loading.value = false;
  }
}

const filtered = computed(() => {
  const needle = q.value.trim().toLowerCase();
  const rows = needle
    ? users.value.filter(
        (u) =>
          u.name.toLowerCase().includes(needle) ||
          u.email.toLowerCase().includes(needle),
      )
    : users.value;
  const dir = sortAsc.value ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = String(a[sortKey.value]).toLowerCase();
    const bv = String(b[sortKey.value]).toLowerCase();
    return av < bv ? -dir : av > bv ? dir : 0;
  });
});
function toggleSort(key: "name" | "email" | "createdAt") {
  if (sortKey.value === key) sortAsc.value = !sortAsc.value;
  else {
    sortKey.value = key;
    sortAsc.value = true;
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

// ---------- detail dialog ----------
const detailOpen = ref(false);
const detail = ref<AdminUserDetailResponse | null>(null);
const detailLoading = ref(false);
async function openDetail(u: AdminUserPublic) {
  detailOpen.value = true;
  detailLoading.value = true;
  detail.value = null;
  try {
    detail.value = await $fetch<AdminUserDetailResponse>(
      `/api/admin/users/${u.id}`,
    );
  } catch (e) {
    toast.error((e as Error).message);
    detailOpen.value = false;
  } finally {
    detailLoading.value = false;
  }
}

// ---------- edit / create dialog ----------
const editOpen = ref(false);
const editTarget = ref<AdminUserPublic | null>(null);
const form = ref({ name: "", email: "", emailVerified: true });
const createMode = computed(() => !editTarget.value);
const pwField = ref("");
const busy = ref(false);
function openCreate() {
  editTarget.value = null;
  form.value = { name: "", email: "", emailVerified: true };
  pwField.value = "";
  editOpen.value = true;
}
function openEdit(u: AdminUserPublic) {
  editTarget.value = u;
  form.value = {
    name: u.name,
    email: u.email,
    emailVerified: u.verified,
  };
  pwField.value = "";
  editOpen.value = true;
}
async function submitEdit() {
  busy.value = true;
  try {
    if (createMode.value) {
      await $fetch("/api/admin/users", {
        method: "POST",
        body: {
          name: form.value.name,
          email: form.value.email,
          password: pwField.value,
        },
      });
    } else {
      await $fetch(`/api/admin/users/${editTarget.value!.id}`, {
        method: "PUT",
        body: {
          name: form.value.name,
          email: form.value.email,
          emailVerified: form.value.emailVerified,
        },
      });
      if (pwField.value) await setPassword(editTarget.value!.id, pwField.value);
    }
    editOpen.value = false;
    await load();
    toast.success(t("admin.users.saved"));
  } catch (e) {
    toast.error((e as Error).message);
  } finally {
    busy.value = false;
  }
}
async function setPassword(userId: string, password: string) {
  await $fetch(`/api/admin/users/${userId}/password`, {
    method: "PUT",
    body: { password },
  });
}

// ---------- superadmin toggle / delete ----------
async function toggleAdmin(u: AdminUserPublic) {
  try {
    await $fetch(`/api/admin/users/${u.id}/superadmin`, {
      method: "PUT",
      body: { grant: !u.isSuperAdmin },
    });
    await load();
  } catch (e) {
    toast.error((e as Error).message);
  }
}
async function removeUser(u: AdminUserPublic) {
  if (!confirm(t("admin.users.deleteConfirm", { email: u.email }))) return;
  try {
    await $fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    await load();
    toast.success(t("admin.users.deleted"));
  } catch (e) {
    toast.error((e as Error).message);
  }
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-2">
      <Input
        v-model="q"
        :placeholder="t('admin.users.search')"
        class="max-w-xs"
      />
      <Button size="sm" @click="openCreate">
        <Icon spec="UserPlus" :size="14" />
        {{ t("admin.users.create") }}
      </Button>
    </div>

    <div v-if="loading" class="py-10 text-center text-sm text-muted-foreground">
      {{ t("settings.loading") }}
    </div>
    <div v-else class="overflow-x-auto rounded-lg border">
      <table class="w-full text-sm">
        <thead class="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th
              class="cursor-pointer select-none px-3 py-2 font-medium hover:text-foreground"
              @click="toggleSort('name')"
            >
              {{ t("auth.register.nameLabel") }}
              <span v-if="sortKey === 'name'">{{ sortAsc ? "↑" : "↓" }}</span>
            </th>
            <th
              class="cursor-pointer select-none px-3 py-2 font-medium hover:text-foreground"
              @click="toggleSort('email')"
            >
              {{ t("auth.login.emailLabel") }}
              <span v-if="sortKey === 'email'">{{ sortAsc ? "↑" : "↓" }}</span>
            </th>
            <th class="px-3 py-2 font-medium">
              {{ t("admin.users.verified") }}
            </th>
            <th class="px-3 py-2 font-medium">
              {{ t("admin.users.adminTag") }}
            </th>
            <th
              class="cursor-pointer select-none px-3 py-2 font-medium hover:text-foreground"
              @click="toggleSort('createdAt')"
            >
              {{ t("admin.users.joined") }}
              <span v-if="sortKey === 'createdAt'">
                {{ sortAsc ? "↑" : "↓" }}
              </span>
            </th>
            <th class="px-3 py-2 text-right font-medium">
              {{ t("home.table.action") }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="u in filtered"
            :key="u.id"
            class="border-t transition-colors last:border-0 hover:bg-accent/30"
          >
            <td class="px-3 py-2">
              <button
                type="button"
                class="font-medium hover:underline"
                @click="openDetail(u)"
              >
                {{ u.name }}
              </button>
            </td>
            <td class="px-3 py-2 text-muted-foreground">{{ u.email }}</td>
            <td class="px-3 py-2">
              <span
                class="rounded-full border px-2 py-px text-xs"
                :class="
                  u.verified
                    ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
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
            <td class="px-3 py-2">
              <span v-if="u.isSuperAdmin" class="text-xs text-primary">{{
                t("admin.users.adminTag")
              }}</span>
            </td>
            <td class="px-3 py-2 text-xs text-muted-foreground">
              {{ fmtDate(u.createdAt) }}
            </td>
            <td class="px-3 py-2 text-right">
              <div class="flex justify-end gap-1">
                <Button variant="outline" size="sm" @click="openEdit(u)">
                  {{ t("titles.edit") }}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="u.id === me?.id"
                  @click="toggleAdmin(u)"
                >
                  {{
                    u.isSuperAdmin
                      ? t("admin.users.revoke")
                      : t("admin.users.grant")
                  }}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  class="text-red-600 dark:text-red-400"
                  :disabled="u.id === me?.id"
                  @click="removeUser(u)"
                >
                  {{ t("account.emails.delete") }}
                </Button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- detail dialog -->
    <Dialog v-model:open="detailOpen">
      <DialogContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle>{{ detail?.user.name ?? "…" }}</DialogTitle>
          <DialogDescription>{{ detail?.user.email }}</DialogDescription>
        </DialogHeader>
        <div
          v-if="detailLoading"
          class="py-8 text-center text-sm text-muted-foreground"
        >
          {{ t("settings.loading") }}
        </div>
        <div v-else-if="detail" class="flex flex-col gap-4 text-sm">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <div class="text-xs text-muted-foreground">
                {{ t("admin.users.joined") }}
              </div>
              {{ fmtDate(detail.user.createdAt) }}
            </div>
            <div>
              <div class="text-xs text-muted-foreground">
                {{ t("admin.users.verified") }}
              </div>
              {{ detail.user.verified ? "✓" : "—" }}
            </div>
            <div>
              <div class="text-xs text-muted-foreground">
                {{ t("admin.users.providers") }}
              </div>
              {{ detail.providers.join(", ") || "—" }}
            </div>
            <div>
              <div class="text-xs text-muted-foreground">
                {{ t("settings.passkey.title") }}
              </div>
              {{ detail.passkeys.length }}
            </div>
            <div>
              <div class="text-xs text-muted-foreground">
                {{ t("admin.users.invoiceCount") }}
              </div>
              {{ detail.invoiceCount }}
            </div>
            <div>
              <div class="text-xs text-muted-foreground">
                {{ t("admin.users.campaignCount") }}
              </div>
              {{ detail.campaignCount }}
            </div>
          </div>
          <div>
            <div class="mb-1 text-xs text-muted-foreground">
              {{ t("admin.users.orgs") }}
            </div>
            <div
              v-if="!detail.organizations.length"
              class="text-muted-foreground"
            >
              —
            </div>
            <div
              v-for="o in detail.organizations"
              :key="o.id"
              class="flex items-center justify-between border-b py-1 last:border-0"
            >
              <span>{{ o.name }}</span>
              <span class="text-xs text-muted-foreground">{{ o.role }}</span>
            </div>
          </div>
          <div
            v-if="detail.isEnvAdmin"
            class="text-xs text-amber-600 dark:text-amber-400"
          >
            {{ t("admin.users.envAdmin") }}
          </div>
          <div class="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              @click="
                openEdit(detail.user);
                detailOpen = false;
              "
            >
              {{ t("titles.edit") }}
            </Button>
            <Button
              v-if="detail.user.id !== me?.id"
              variant="ghost"
              size="sm"
              class="text-red-600 dark:text-red-400"
              @click="
                removeUser(detail.user);
                detailOpen = false;
              "
            >
              {{ t("account.emails.delete") }}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- create / edit dialog -->
    <Dialog v-model:open="editOpen">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {{
              createMode
                ? t("admin.users.create")
                : t("admin.users.edit") + " · " + editTarget?.name
            }}
          </DialogTitle>
        </DialogHeader>
        <form class="flex flex-col gap-3" @submit.prevent="submitEdit">
          <div class="flex flex-col gap-1.5">
            <Label>{{ t("auth.register.nameLabel") }}</Label>
            <Input v-model="form.name" required />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>{{ t("auth.login.emailLabel") }}</Label>
            <Input v-model="form.email" type="email" required />
          </div>
          <div v-if="!createMode" class="flex items-center gap-2">
            <input
              v-model="form.emailVerified"
              type="checkbox"
              class="size-4 accent-(--color-primary)"
            />
            <span class="text-sm">{{ t("admin.users.verified") }}</span>
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>{{ t("admin.users.password") }}</Label>
            <Input
              v-model="pwField"
              type="password"
              autocomplete="new-password"
              :placeholder="
                createMode
                  ? t('auth.register.passwordHint')
                  : t('admin.users.passwordKeep')
              "
              :required="createMode"
              minlength="8"
            />
          </div>
          <DialogFooter class="mt-1 flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              :disabled="busy"
              @click="editOpen = false"
            >
              {{ t("common.cancel") }}
            </Button>
            <Button type="submit" size="sm" :disabled="busy">
              {{ t("titles.save") }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
