<script setup lang="ts">
import type { CampaignPublic, OrgFull, OrgRole } from "#shared/types";
import { useOrgs } from "~/composables/useOrgs";

definePageMeta({ layout: "default" });
const { t } = useI18n();
useHead({ title: () => t("orgs.title") });
const { user } = useAuth();

const {
  organizations,
  activeOrganization,
  myInvitations,
  refresh,
  create,
  setActive,
  getFull,
  invite,
  acceptInvitation,
  rejectInvitation,
  removeMember,
  updateMemberRole,
  leave,
  remove,
} = useOrgs();

const selectedOrg = ref<OrgFull | null>(null);
const loading = ref(true);
const creating = ref(false);
const inviting = ref(false);

// new-org form
const newName = ref("");
const newSlug = ref("");
// invite form (scoped to the selected org)
const inviteEmail = ref("");
const inviteRole = ref<OrgRole>("member");

function roleLabel(role: string): string {
  switch (role) {
    case "owner":
      return t("orgs.role.owner");
    case "admin":
      return t("orgs.role.admin");
    case "editor":
      return t("orgs.role.editor");
    case "viewer":
      return t("orgs.role.viewer");
    default:
      return t("orgs.role.member");
  }
}

async function load() {
  loading.value = true;
  try {
    await refresh();
  } finally {
    loading.value = false;
  }
}

async function onCreate() {
  if (!newName.value.trim() || !newSlug.value.trim()) return;
  creating.value = true;
  try {
    await create(newName.value.trim(), newSlug.value.trim().toLowerCase());
    newName.value = "";
    newSlug.value = "";
    toast.success(t("orgs.title"));
  } catch (e) {
    toast.error(messageFromError(e, t("orgs.createFailed")));
  } finally {
    creating.value = false;
  }
}

async function openOrg(id: string) {
  await setActive(id);
  selectedOrg.value = await getFull(id);
  if (isPrivileged.value) await loadPlatform(id);
}

async function onInvite() {
  if (!selectedOrg.value || !inviteEmail.value.trim()) return;
  inviting.value = true;
  try {
    await invite(
      inviteEmail.value.trim(),
      inviteRole.value,
      selectedOrg.value.id,
    );
    selectedOrg.value = await getFull(selectedOrg.value.id);
    inviteEmail.value = "";
    toast.success(t("orgs.invite"));
  } catch (e) {
    toast.error(messageFromError(e, t("orgs.inviteFailed")));
  } finally {
    inviting.value = false;
  }
}

async function onAccept(id: string) {
  try {
    await acceptInvitation(id);
    toast.success(t("orgs.accepted"));
    await refresh();
  } catch (e) {
    toast.error(messageFromError(e, t("orgs.accept")));
  }
}

async function onReject(id: string) {
  try {
    await rejectInvitation(id);
    toast.success(t("orgs.rejected"));
  } catch (e) {
    toast.error(messageFromError(e, t("orgs.reject")));
  }
}

async function onRemoveMember(memberId: string) {
  if (!selectedOrg.value) return;
  try {
    await removeMember(memberId);
    selectedOrg.value = await getFull(selectedOrg.value.id);
  } catch (e) {
    toast.error(messageFromError(e, t("orgs.remove")));
  }
}

async function onChangeRole(memberId: string, role: OrgRole) {
  if (!selectedOrg.value) return;
  try {
    await updateMemberRole(memberId, role);
    selectedOrg.value = await getFull(selectedOrg.value.id);
  } catch (e) {
    toast.error(messageFromError(e, t("orgs.inviteFailed")));
  }
}

async function onLeave(id: string) {
  if (!confirm(t("orgs.leaveConfirm"))) return;
  try {
    await leave();
    selectedOrg.value = null;
    await refresh();
  } catch (e) {
    toast.error(messageFromError(e, t("orgs.leave")));
  }
}

async function onDelete(id: string) {
  if (!confirm(t("orgs.deleteConfirm"))) return;
  try {
    await remove(id);
    selectedOrg.value = null;
  } catch (e) {
    toast.error(messageFromError(e, t("orgs.delete")));
  }
}

// ---------- platform: org visibility / migration panel / audit ----------
const myRole = computed(() => {
  const org = selectedOrg.value;
  const uid = user.value?.id;
  if (!org || !uid) return null;
  return org.members.find((m) => m.userId === uid)?.role ?? null;
});
const isPrivileged = computed(
  () => myRole.value === "owner" || myRole.value === "admin",
);

const orgVisibility = ref<"public" | "private">("public");
const unconfirmed = ref<CampaignPublic[]>([]);
const auditOpen = ref(false);
const auditLogs = ref<
  {
    id: number;
    action: string;
    target: string;
    actorName: string;
    createdAt: string;
    meta: Record<string, unknown>;
  }[]
>([]);
const auditLoading = ref(false);
const transfers = ref<
  {
    id: number;
    campaignId: number;
    campaign: string;
    incoming: boolean;
    fromOrg: string;
    toOrg: string;
    createdAt: string;
  }[]
>([]);
const customRoles = ref<{ name: string; baseRole: string }[]>([]);
const newRoleName = ref("");
const newRoleBase = ref("editor");

/** Role options for invite / change-role selects: base tiers + custom names. */
const assignableRoles = computed(() => [
  "admin",
  "editor",
  "viewer",
  "member",
  ...customRoles.value.map((r) => r.name),
]);

function roleDisplay(r: string): string {
  const base = ["owner", "admin", "editor", "viewer", "member"].includes(r);
  if (base) return roleLabel(r);
  const custom = customRoles.value.find((c) => c.name === r);
  return custom ? `${r} (${roleLabel(custom.baseRole)})` : r;
}

async function addRole() {
  if (!selectedOrg.value || !newRoleName.value.trim()) return;
  try {
    await $fetch(`/api/orgs/${selectedOrg.value.id}/roles`, {
      method: "POST",
      body: { name: newRoleName.value.trim(), baseRole: newRoleBase.value },
    });
    newRoleName.value = "";
    toast.success(t("settings.saved"));
    await loadPlatform(selectedOrg.value.id);
  } catch (e) {
    toast.error((e as Error).message);
  }
}
async function deleteRole(name: string) {
  if (!selectedOrg.value) return;
  try {
    await $fetch(`/api/orgs/${selectedOrg.value.id}/roles/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    await loadPlatform(selectedOrg.value.id);
    selectedOrg.value = await getFull(selectedOrg.value.id);
  } catch (e) {
    toast.error((e as Error).message);
  }
}

async function loadPlatform(id: string) {
  try {
    const v = await $fetch<{ visibility: "public" | "private" }>(
      `/api/orgs/${id}/visibility`,
    );
    orgVisibility.value = v.visibility;
  } catch {
    orgVisibility.value = "public";
  }
  try {
    const data = await listCampaigns();
    unconfirmed.value = data.organizations.filter(
      (c) => c.organizationId === id && !c.visibilityConfirmed,
    );
  } catch {
    unconfirmed.value = [];
  }
  try {
    const tr = await $fetch<{ transfers: typeof transfers.value }>(
      `/api/orgs/${id}/transfers`,
    );
    transfers.value = tr.transfers;
  } catch {
    transfers.value = [];
  }
  try {
    const r = await $fetch<{ roles: typeof customRoles.value }>(
      `/api/orgs/${id}/roles`,
    );
    customRoles.value = r.roles;
  } catch {
    customRoles.value = [];
  }
}

async function acceptTransfer(id: number) {
  try {
    await $fetch(`/api/transfers/${id}/accept`, { method: "POST" });
    toast.success(t("orgs.transfer.accepted"));
    if (selectedOrg.value) await loadPlatform(selectedOrg.value.id);
  } catch (e) {
    toast.error((e as Error).message);
  }
}
async function cancelTransfer(id: number) {
  try {
    await $fetch(`/api/transfers/${id}`, { method: "DELETE" });
    if (selectedOrg.value) await loadPlatform(selectedOrg.value.id);
  } catch (e) {
    toast.error((e as Error).message);
  }
}

async function setOrgVisibility(v: "public" | "private") {
  if (!selectedOrg.value) return;
  try {
    await $fetch(`/api/orgs/${selectedOrg.value.id}/visibility`, {
      method: "PUT",
      body: { visibility: v },
    });
    orgVisibility.value = v;
    toast.success(t("settings.saved"));
  } catch (e) {
    toast.error((e as Error).message);
  }
}

/** Confirm one legacy campaign's visibility → migrates it to the new model. */
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
    if (selectedOrg.value) await loadPlatform(selectedOrg.value.id);
  } catch (e) {
    toast.error((e as Error).message);
  }
}

async function openAudit() {
  if (!selectedOrg.value) return;
  auditOpen.value = true;
  auditLoading.value = true;
  try {
    const data = await $fetch<{ logs: typeof auditLogs.value }>("/api/audit", {
      query: { orgId: selectedOrg.value.id },
    });
    auditLogs.value = data.logs;
  } catch (e) {
    toast.error((e as Error).message);
    auditLogs.value = [];
  } finally {
    auditLoading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- breadcrumb -->
    <div class="flex items-center gap-2 text-sm text-muted-foreground">
      <NuxtLink
        to="/"
        class="inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground"
        ><Icon spec="ArrowLeft" :size="14" /> {{ t("settings.back") }}</NuxtLink
      >
      <span>/</span>
      <span class="text-foreground">{{ t("orgs.title") }}</span>
    </div>

    <p class="text-sm text-muted-foreground">{{ t("orgs.desc") }}</p>

    <!-- active scope indicator -->
    <div
      class="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm"
    >
      <Icon spec="Building2" :size="16" class="text-muted-foreground" />
      <span class="text-muted-foreground">{{ t("orgs.activeOrg") }}:</span>
      <span v-if="activeOrganization" class="font-medium text-foreground">{{
        activeOrganization.name
      }}</span>
      <span v-else class="font-medium text-foreground">{{
        t("orgs.personal")
      }}</span>
      <Button
        v-if="activeOrganization"
        variant="ghost"
        size="sm"
        class="ml-auto"
        @click="
          async () => {
            await setActive(null);
          }
        "
      >
        {{ t("orgs.switchTo") }}
      </Button>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <!-- Organizations list + create -->
      <Card>
        <CardHeader>
          <CardTitle>{{ t("orgs.yourOrgs") }}</CardTitle>
        </CardHeader>
        <CardContent class="flex flex-col gap-3">
          <div
            v-if="loading"
            class="py-6 text-center text-sm text-muted-foreground"
          >
            {{ t("settings.loading") }}
          </div>
          <p
            v-else-if="!organizations.length"
            class="py-6 text-center text-sm text-muted-foreground"
          >
            {{ t("orgs.noOrgs") }}
          </p>
          <div v-else class="flex flex-col gap-2">
            <div
              v-for="org in organizations"
              :key="org.id"
              class="flex items-center gap-3 rounded-lg border p-3"
            >
              <span
                class="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary"
              >
                <Icon spec="Building2" :size="16" />
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ org.name }}</p>
                <p class="truncate text-xs text-muted-foreground">
                  {{ org.slug }}
                </p>
              </div>
              <Button variant="outline" size="sm" @click="openOrg(org.id)">{{
                t("orgs.open")
              }}</Button>
            </div>
          </div>

          <!-- new org form -->
          <div
            class="mt-2 flex flex-col gap-2 rounded-lg border border-dashed p-3"
          >
            <p class="text-xs font-medium text-muted-foreground">
              {{ t("orgs.new") }}
            </p>
            <div class="grid gap-2 sm:grid-cols-2">
              <Input
                v-model="newName"
                :placeholder="t('orgs.namePlaceholder')"
              />
              <Input
                v-model="newSlug"
                :placeholder="t('orgs.slugPlaceholder')"
              />
            </div>
            <p class="text-xs text-muted-foreground">
              {{ t("orgs.slugHint") }}
            </p>
            <Button
              :disabled="creating || !newName.trim() || !newSlug.trim()"
              size="sm"
              class="self-start"
              @click="onCreate"
            >
              <Icon spec="Plus" :size="14" />
              {{ creating ? t("orgs.creating") : t("orgs.create") }}
            </Button>
          </div>
        </CardContent>
      </Card>

      <!-- Pending invitations -->
      <Card>
        <CardHeader>
          <CardTitle>{{ t("orgs.invitations") }}</CardTitle>
        </CardHeader>
        <CardContent class="flex flex-col gap-2">
          <p
            v-if="!myInvitations.length"
            class="py-6 text-center text-sm text-muted-foreground"
          >
            {{ t("orgs.noInvitations") }}
          </p>
          <div
            v-for="inv in myInvitations"
            :key="inv.id"
            class="flex items-center gap-3 rounded-lg border p-3"
          >
            <Icon
              spec="Mail"
              :size="16"
              class="shrink-0 text-muted-foreground"
            />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">
                {{ inv.organizationName || inv.email }}
              </p>
              <p class="truncate text-xs text-muted-foreground">
                {{ roleLabel(inv.role) }}
              </p>
            </div>
            <Button variant="outline" size="sm" @click="onAccept(inv.id)">{{
              t("orgs.accept")
            }}</Button>
            <Button variant="ghost" size="sm" @click="onReject(inv.id)">{{
              t("orgs.reject")
            }}</Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Members of the selected organization -->
    <Card v-if="selectedOrg">
      <CardHeader class="flex-row items-center justify-between">
        <div>
          <CardTitle
            >{{ selectedOrg.name }} · {{ t("orgs.members") }}</CardTitle
          >
          <CardDescription>{{ selectedOrg.slug }}</CardDescription>
        </div>
        <div class="flex shrink-0 flex-wrap gap-2">
          <Button
            v-if="isPrivileged"
            variant="outline"
            size="sm"
            @click="
              setOrgVisibility(orgVisibility === 'public' ? 'private' : 'public')
            "
          >
            <Icon spec="Eye" :size="14" />
            {{
              orgVisibility === "public"
                ? t("orgs.vis.public")
                : t("orgs.vis.private")
            }}
          </Button>
          <Button v-if="isPrivileged" variant="outline" size="sm" @click="openAudit">
            <Icon spec="ScrollText" :size="14" />
            {{ t("orgs.audit.title") }}
          </Button>
          <Button variant="ghost" size="sm" @click="onLeave(selectedOrg.id)">{{
            t("orgs.leave")
          }}</Button>
          <Button
            variant="destructive"
            size="sm"
            @click="onDelete(selectedOrg.id)"
            >{{ t("orgs.delete") }}</Button
          >
        </div>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <!-- migration panel: legacy campaigns awaiting a visibility decision -->
        <div
          v-if="isPrivileged && unconfirmed.length"
          class="flex flex-col gap-2 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-3"
        >
          <div class="text-xs font-medium text-amber-700 dark:text-amber-400">
            {{ t("orgs.migration.title") }} ({{ unconfirmed.length }})
          </div>
          <p class="text-xs text-muted-foreground">
            {{ t("orgs.migration.desc") }}
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

        <!-- pending transfers (in/out) -->
        <div
          v-if="isPrivileged && transfers.length"
          class="flex flex-col gap-2 rounded-lg border p-3"
        >
          <div class="text-xs font-medium text-muted-foreground">
            {{ t("orgs.transfer.title") }}
          </div>
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
            <span class="text-xs text-muted-foreground">
              {{ tr.fromOrg }} → {{ tr.toOrg }}
            </span>
            <Button
              v-if="tr.incoming"
              size="sm"
              @click="acceptTransfer(tr.id)"
              >{{ t("orgs.transfer.accept") }}</Button
            >
            <Button variant="ghost" size="sm" @click="cancelTransfer(tr.id)">{{
              t("orgs.transfer.reject")
            }}</Button>
          </div>
        </div>

        <!-- invite form -->
        <div class="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div class="flex flex-1 flex-col gap-1">
            <Label>{{ t("orgs.inviteEmail") }}</Label>
            <Input
              v-model="inviteEmail"
              type="email"
              placeholder="you@example.com"
            />
          </div>
          <div class="flex flex-col gap-1">
            <Label>{{ t("orgs.inviteRole") }}</Label>
            <select
              v-model="inviteRole"
              class="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option v-for="r in assignableRoles" :key="r" :value="r">
                {{ roleDisplay(r) }}
              </option>
            </select>
          </div>
          <Button :disabled="inviting || !inviteEmail.trim()" @click="onInvite">
            <Icon spec="UserPlus" :size="14" />
            {{ inviting ? t("orgs.inviting") : t("orgs.inviteSend") }}
          </Button>
        </div>

        <!-- custom roles (Owner only) -->
        <div
          v-if="myRole === 'owner'"
          class="flex flex-col gap-2 rounded-lg border border-dashed p-3"
        >
          <div class="text-xs font-medium text-muted-foreground">
            {{ t("orgs.customRoles.title") }}
          </div>
          <p class="text-xs text-muted-foreground">
            {{ t("orgs.customRoles.desc") }}
          </p>
          <div
            v-for="r in customRoles"
            :key="r.name"
            class="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm"
          >
            <span class="font-medium">{{ r.name }}</span>
            <span class="text-xs text-muted-foreground"
              >· {{ roleLabel(r.baseRole) }}</span
            >
            <Button
              variant="ghost"
              size="sm"
              class="ml-auto"
              @click="deleteRole(r.name)"
              >{{ t("orgs.remove") }}</Button
            >
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
                v-for="b in ['admin', 'editor', 'viewer', 'member']"
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

        <!-- members table -->
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="text-left text-xs text-muted-foreground">
              <tr class="border-b">
                <th class="py-2 pr-4 font-medium">
                  {{ t("auth.register.emailLabel") }}
                </th>
                <th class="py-2 pr-4 font-medium">
                  {{ t("auth.register.nameLabel") }}
                </th>
                <th class="py-2 pr-4 font-medium">
                  {{ t("orgs.inviteRole") }}
                </th>
                <th class="py-2 pr-4 font-medium text-right">
                  {{ t("home.table.action") }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="m in selectedOrg.members"
                :key="m.id"
                class="border-b last:border-0"
              >
                <td class="py-2 pr-4">{{ m.user.email }}</td>
                <td class="py-2 pr-4 text-muted-foreground">
                  {{ m.user.name }}
                </td>
                <td class="py-2 pr-4">
                  <select
                    v-if="m.role !== 'owner'"
                    :value="m.role"
                    class="h-8 rounded-md border bg-background px-2 text-xs"
                    @change="
                      onChangeRole(
                        m.id,
                        ($event.target as HTMLSelectElement).value as OrgRole,
                      )
                    "
                  >
                    <option v-for="r in assignableRoles" :key="r" :value="r">
                      {{ roleDisplay(r) }}
                    </option>
                  </select>
                  <span v-else class="font-medium text-primary">{{
                    roleLabel(m.role)
                  }}</span>
                </td>
                <td class="py-2 pr-4 text-right">
                  <Button
                    v-if="m.role !== 'owner'"
                    variant="ghost"
                    size="sm"
                    @click="onRemoveMember(m.id)"
                    >{{ t("orgs.remove") }}</Button
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>

    <!-- audit log modal -->
    <div
      v-if="auditOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="auditOpen = false"
    >
      <Card class="max-h-[80vh] w-full max-w-xl overflow-y-auto">
        <CardHeader>
          <CardTitle>{{ t("orgs.audit.title") }}</CardTitle>
          <CardDescription>{{ t("orgs.audit.desc") }}</CardDescription>
        </CardHeader>
        <CardContent class="flex flex-col gap-1 text-sm">
          <div
            v-if="auditLoading"
            class="py-8 text-center text-muted-foreground"
          >
            {{ t("settings.loading") }}
          </div>
          <div
            v-for="l in auditLogs"
            :key="l.id"
            class="flex flex-wrap items-baseline gap-x-2 border-b py-2 text-xs last:border-0"
          >
            <span class="w-32 shrink-0 text-muted-foreground">{{
              new Date(l.createdAt).toLocaleString()
            }}</span>
            <span class="font-mono font-medium">{{ l.action }}</span>
            <span v-if="l.target" class="text-muted-foreground"
              >· {{ l.target }}</span>
            <span class="ml-auto text-muted-foreground">{{ l.actorName }}</span>
          </div>
          <p
            v-if="!auditLoading && !auditLogs.length"
            class="py-8 text-center text-muted-foreground"
          >
            {{ t("orgs.audit.empty") }}
          </p>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
