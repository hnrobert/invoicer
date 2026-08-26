<script setup lang="ts">
// GitHub org → Settings: left section nav (General / Roles / Migration /
// Transfers / Audit / Danger zone) + right content, driven by ?section=.
// Owner/Admin only (server enforces every endpoint used here).
import type { CampaignPublic } from "#shared/types";

definePageMeta({ layout: "default" });
const { t } = useI18n();
const route = useRoute();
const slug = route.params.slug as string;
useHead({ title: () => `${t("orgs.tabs.settings")} · ${slug}` });

const section = computed(() =>
  [
    "general",
    "titles",
    "roles",
    "migration",
    "transfers",
    "audit",
    "danger",
  ].includes(String(route.query.section))
    ? (route.query.section as string)
    : "general",
);
const secUrl = (key: string) => ({ path: route.path, query: { section: key } });

const { org, full, loading, notFound, isPrivileged, myRole, visibility, load } =
  useOrgContext(slug);
const { leave, remove } = useOrgs();

// ---------- general: visibility ----------
async function setVisibility(v: "public" | "private") {
  if (!org.value) return;
  try {
    await $fetch(`/api/orgs/${org.value.id}/visibility`, {
      method: "PUT",
      body: { visibility: v },
    });
    visibility.value = v;
    toast.success(t("settings.saved"));
  } catch (e) {
    toast.error((e as Error).message);
  }
}

// ---------- migration ----------
const unconfirmed = ref<CampaignPublic[]>([]);
async function loadUnconfirmed() {
  if (!org.value) return;
  try {
    const data = await listCampaigns();
    unconfirmed.value = data.organizations.filter(
      (c) => c.organizationId === org.value?.id && !c.visibilityConfirmed,
    );
  } catch {
    unconfirmed.value = [];
  }
}
async function confirmCampaign(
  c: CampaignPublic,
  v: "public" | "internal" | "private",
) {
  try {
    await $fetch(`/api/campaigns/${c.id}`, {
      method: "PUT",
      body: { visibility: v },
    });
    toast.success(t("orgs.migration.done"));
    await loadUnconfirmed();
  } catch (e) {
    toast.error((e as Error).message);
  }
}

// ---------- roles ----------
const customRoles = ref<
  { name: string; baseRole: string; permissions: string[] }[]
>([]);
const newRoleName = ref("");
const newRoleBase = ref("editor");
const newRolePerms = ref<string[]>([]);
const PERMISSION_CATALOG = [
  "campaign.create",
  "campaign.upload",
  "campaign.viewAll",
  "campaign.review",
  "campaign.export",
  "campaign.manage",
  "org.visibility.manage",
  "org.transfer.accept",
  "org.audit.view",
] as const;
const editingRole = ref<string | null>(null);
const editingPerms = ref<string[]>([]);
function togglePerm(list: string[], p: string) {
  const i = list.indexOf(p);
  if (i >= 0) list.splice(i, 1);
  else list.push(p);
}
async function saveRolePerms(name: string) {
  try {
    await $fetch(
      `/api/orgs/${org.value!.id}/roles/${encodeURIComponent(name)}`,
      { method: "PUT", body: { permissions: editingPerms.value } },
    );
    editingRole.value = null;
    await loadRoles();
    toast.success(t("settings.saved"));
  } catch (e) {
    toast.error((e as Error).message);
  }
}
async function loadRoles() {
  if (!org.value) return;
  try {
    const r = await $fetch<{ roles: typeof customRoles.value }>(
      `/api/orgs/${org.value.id}/roles`,
    );
    customRoles.value = r.roles;
  } catch {
    customRoles.value = [];
  }
}
async function addRole() {
  if (!org.value || !newRoleName.value.trim()) return;
  try {
    await $fetch(`/api/orgs/${org.value.id}/roles`, {
      method: "POST",
      body: {
        name: newRoleName.value.trim(),
        baseRole: newRoleBase.value,
        permissions: newRolePerms.value,
      },
    });
    newRoleName.value = "";
    await loadRoles();
  } catch (e) {
    toast.error((e as Error).message);
  }
}
async function deleteRole(name: string) {
  if (!org.value) return;
  try {
    await $fetch(
      `/api/orgs/${org.value.id}/roles/${encodeURIComponent(name)}`,
      {
        method: "DELETE",
      },
    );
    await loadRoles();
    await load();
  } catch (e) {
    toast.error((e as Error).message);
  }
}
function roleLabel(r: string): string {
  switch (r) {
    case "admin":
      return t("orgs.role.admin");
    case "editor":
      return t("orgs.role.editor");
    case "supervisor":
      return t("orgs.role.supervisor");
    case "viewer":
      return t("orgs.role.viewer");
    case "member":
      return t("orgs.role.member");
    default:
      return r;
  }
}

// ---------- transfers ----------
const transfers = ref<
  {
    id: number;
    campaign: string;
    incoming: boolean;
    fromOrg: string;
    toOrg: string;
  }[]
>([]);
async function loadTransfers() {
  if (!org.value) return;
  try {
    const tr = await $fetch<{ transfers: typeof transfers.value }>(
      `/api/orgs/${org.value.id}/transfers`,
    );
    transfers.value = tr.transfers;
  } catch {
    transfers.value = [];
  }
}
async function acceptTransfer(id: number) {
  try {
    await $fetch(`/api/transfers/${id}/accept`, { method: "POST" });
    toast.success(t("orgs.transfer.accepted"));
    await loadTransfers();
  } catch (e) {
    toast.error((e as Error).message);
  }
}
async function cancelTransfer(id: number) {
  try {
    await $fetch(`/api/transfers/${id}`, { method: "DELETE" });
    await loadTransfers();
  } catch (e) {
    toast.error((e as Error).message);
  }
}

// ---------- audit ----------
const auditLogs = ref<
  {
    id: number;
    action: string;
    target: string;
    actorName: string;
    createdAt: string;
  }[]
>([]);
const auditLoading = ref(false);
async function loadAudit() {
  if (!org.value) return;
  auditLoading.value = true;
  try {
    const data = await $fetch<{ logs: typeof auditLogs.value }>("/api/audit", {
      query: { orgId: org.value.id },
    });
    auditLogs.value = data.logs;
  } catch {
    auditLogs.value = [];
  } finally {
    auditLoading.value = false;
  }
}

// ---------- danger ----------
async function onLeave() {
  if (!confirm(t("orgs.leaveConfirm"))) return;
  try {
    await leave();
    navigateTo("/", { replace: true });
  } catch (e) {
    toast.error(messageFromError(e, t("orgs.leave")));
  }
}
async function onDelete() {
  if (!confirm(t("orgs.deleteConfirm"))) return;
  try {
    await remove(org.value!.id);
    navigateTo("/", { replace: true });
  } catch (e) {
    toast.error(messageFromError(e, t("orgs.delete")));
  }
}

const sections = computed(() => [
  { key: "general", label: t("orgs.settings.general"), to: secUrl("general") },
  { key: "titles", label: t("titles.title"), to: secUrl("titles") },
  { key: "roles", label: t("orgs.customRoles.title"), to: secUrl("roles") },
  { key: "migration", label: t("orgs.migration.nav"), to: secUrl("migration") },
  { key: "transfers", label: t("orgs.transfer.nav"), to: secUrl("transfers") },
  { key: "audit", label: t("orgs.audit.title"), to: secUrl("audit") },
  { key: "danger", label: t("orgs.danger.title"), to: secUrl("danger") },
]);

onMounted(async () => {
  await load();
  if (notFound.value || !isPrivileged.value) return;
  await Promise.all([
    loadUnconfirmed(),
    loadRoles(),
    loadTransfers(),
    loadAudit(),
  ]);
});
</script>

<template>
  <div v-if="notFound" class="py-16 text-center text-sm text-muted-foreground">
    {{ t("orgs.notFound") }}
  </div>
  <div
    v-else-if="loading"
    class="py-16 text-center text-sm text-muted-foreground"
  >
    {{ t("settings.loading") }}
  </div>
  <div v-else-if="org && full && isPrivileged" class="flex flex-col gap-6">
    <OrgHeader
      :slug="org.slug"
      :name="org.name"
      :visibility="visibility"
      show-settings
    />

    <SettingsShell
      :title="t('orgs.tabs.settings')"
      :active="section"
      :sections="sections"
    >
      <!-- general -->
      <div v-if="section === 'general'" class="flex flex-col gap-4">
        <h3 class="text-base font-semibold">
          {{ t("orgs.settings.visibility") }}
        </h3>
        <p class="text-sm text-muted-foreground">
          {{ t("orgs.settings.visibilityDesc") }}
        </p>
        <div class="flex flex-wrap gap-2">
          <Button
            :variant="visibility === 'public' ? 'default' : 'outline'"
            size="sm"
            @click="setVisibility('public')"
            >{{ t("orgs.vis.public") }}</Button
          >
          <Button
            :variant="visibility === 'private' ? 'default' : 'outline'"
            size="sm"
            @click="setVisibility('private')"
            >{{ t("orgs.vis.private") }}</Button
          >
        </div>
      </div>

      <!-- roles -->
      <div v-else-if="section === 'titles'">
        <TitleManager owner-type="org" :org-id="org!.id" />
      </div>

      <div v-else-if="section === 'roles'" class="flex flex-col gap-3">
        <h3 class="text-base font-semibold">
          {{ t("orgs.customRoles.title") }}
        </h3>
        <p class="text-sm text-muted-foreground">
          {{ t("orgs.customRoles.desc") }}
        </p>
        <div
          v-for="r in customRoles"
          :key="r.name"
          class="flex flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm"
        >
          <span class="font-medium">{{ r.name }}</span>
          <span
            v-for="p in r.permissions"
            :key="p"
            class="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
            >{{ t(`perms.${p}`) }}</span
          >
          <Button
            v-if="editingRole !== r.name"
            variant="outline"
            size="sm"
            class="ml-auto"
            @click="
              editingRole = r.name;
              editingPerms = [...r.permissions];
            "
          >
            {{ t("titles.edit") }}
          </Button>
          <Button
            v-else
            variant="ghost"
            size="sm"
            class="ml-auto"
            @click="saveRolePerms(r.name)"
          />
          <Button
            v-if="editingRole === r.name"
            variant="ghost"
            size="sm"
            @click="editingRole = null"
          >
            {{ t("common.cancel") }}
          </Button>
          <Button variant="ghost" size="sm" @click="deleteRole(r.name)">
            {{ t("orgs.remove") }}
          </Button>
          <div
            v-if="editingRole === r.name"
            class="mt-2 flex flex-col gap-1 rounded-md border border-dashed p-2"
          >
            <div class="flex flex-wrap gap-x-4 gap-y-1.5">
              <label
                v-for="p in PERMISSION_CATALOG"
                :key="p"
                class="flex items-center gap-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  class="size-4 accent-(--color-primary)"
                  :checked="editingPerms.includes(p)"
                  @change="togglePerm(editingPerms, p)"
                />
                {{ t(`perms.${p}`) }}
              </label>
            </div>
          </div>
        </div>

        <p v-if="!customRoles.length" class="text-xs text-muted-foreground">
          {{ t("orgs.customRoles.none") }}
        </p>
        <!-- permission checkboxes: new role -->
        <div class="flex flex-col gap-1.5">
          <div class="text-xs font-medium text-muted-foreground">
            {{ t("titles.permLabel") }}
          </div>
          <div class="flex flex-wrap gap-x-4 gap-y-1.5">
            <label
              v-for="p in PERMISSION_CATALOG"
              :key="p"
              class="flex items-center gap-1.5 text-sm"
            >
              <input
                type="checkbox"
                class="size-4 accent-(--color-primary)"
                :checked="newRolePerms.includes(p)"
                @change="togglePerm(newRolePerms, p)"
              />
              {{ t(`perms.${p}`) }}
            </label>
          </div>
        </div>
        <form class="flex flex-wrap gap-2" @submit.prevent="addRole">
          <Input
            v-model="newRoleName"
            :placeholder="t('orgs.customRoles.namePlaceholder')"
            class="w-40"
          />
          <select
            v-model="newRoleBase"
            class="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option
              v-for="b in ['admin', 'editor', 'supervisor', 'viewer', 'member']"
              :key="b"
              :value="b"
            >
              {{ roleLabel(b) }}
            </option>
          </select>
          <Button
            type="submit"
            variant="outline"
            :disabled="!newRoleName.trim()"
          >
            {{ t("home.collab.add") }}
          </Button>
        </form>
      </div>

      <!-- migration -->
      <div v-else-if="section === 'migration'" class="flex flex-col gap-3">
        <h3 class="text-base font-semibold">
          {{ t("orgs.migration.title") }} ({{ unconfirmed.length }})
        </h3>
        <p class="text-sm text-muted-foreground">
          {{ t("orgs.migration.desc") }}
        </p>
        <p v-if="!unconfirmed.length" class="text-sm text-muted-foreground">
          {{ t("orgs.migration.none") }}
        </p>
        <div
          v-for="c in unconfirmed"
          :key="c.id"
          class="flex flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm"
        >
          <span class="min-w-0 flex-1 truncate font-medium">{{
            c.name || c.expectedTitle
          }}</span>
          <div class="flex gap-1">
            <Button
              v-for="v in ['internal', 'public', 'private'] as const"
              :key="v"
              variant="outline"
              size="sm"
              @click="confirmCampaign(c, v)"
            >
              {{ t(`home.settings.vis.${v}`) }}
            </Button>
          </div>
        </div>
      </div>

      <!-- transfers -->
      <div v-else-if="section === 'transfers'" class="flex flex-col gap-3">
        <h3 class="text-base font-semibold">{{ t("orgs.transfer.title") }}</h3>
        <p v-if="!transfers.length" class="text-sm text-muted-foreground">
          {{ t("orgs.transfer.none") }}
        </p>
        <div
          v-for="tr in transfers"
          :key="tr.id"
          class="flex flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm"
        >
          <Icon
            :spec="tr.incoming ? 'ArrowDownLeft' : 'ArrowUpRight'"
            :size="14"
            class="text-muted-foreground"
          />
          <span class="min-w-0 flex-1 truncate font-medium">{{
            tr.campaign
          }}</span>
          <span class="text-xs text-muted-foreground"
            >{{ tr.fromOrg }} → {{ tr.toOrg }}</span
          >
          <Button v-if="tr.incoming" size="sm" @click="acceptTransfer(tr.id)">
            {{ t("orgs.transfer.accept") }}
          </Button>
          <Button variant="ghost" size="sm" @click="cancelTransfer(tr.id)">
            {{ t("orgs.transfer.reject") }}
          </Button>
        </div>
      </div>

      <!-- audit -->
      <div v-else-if="section === 'audit'" class="flex flex-col gap-1">
        <h3 class="mb-2 text-base font-semibold">
          {{ t("orgs.audit.title") }}
        </h3>
        <div
          v-if="auditLoading"
          class="py-8 text-center text-sm text-muted-foreground"
        >
          {{ t("settings.loading") }}
        </div>
        <div
          v-for="l in auditLogs"
          :key="l.id"
          class="flex flex-wrap items-baseline gap-x-2 border-b py-2 text-xs"
        >
          <span class="w-36 shrink-0 text-muted-foreground">
            {{ new Date(l.createdAt).toLocaleString() }}
          </span>
          <span class="font-mono font-medium">{{ l.action }}</span>
          <span v-if="l.target" class="text-muted-foreground"
            >· {{ l.target }}</span
          >
          <span class="ml-auto text-muted-foreground">{{ l.actorName }}</span>
        </div>
        <p
          v-if="!auditLoading && !auditLogs.length"
          class="py-8 text-center text-sm text-muted-foreground"
        >
          {{ t("orgs.audit.empty") }}
        </p>
      </div>

      <!-- danger -->
      <div
        v-else-if="section === 'danger'"
        class="flex flex-col gap-4 rounded-lg border border-destructive/40 p-4"
      >
        <h3 class="text-base font-semibold text-destructive">
          {{ t("orgs.danger.title") }}
        </h3>
        <div class="flex flex-wrap gap-2">
          <Button
            v-if="myRole !== 'owner'"
            variant="outline"
            size="sm"
            @click="onLeave"
          >
            {{ t("orgs.leave") }}
          </Button>
          <Button variant="destructive" size="sm" @click="onDelete">
            {{ t("orgs.delete") }}
          </Button>
        </div>
      </div>
    </SettingsShell>
  </div>
  <div v-else-if="org" class="py-16 text-center text-sm text-muted-foreground">
    {{ t("orgs.settings.ownersOnly") }}
  </div>
</template>
