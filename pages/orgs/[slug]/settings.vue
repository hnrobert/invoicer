<script setup lang="ts">
// GitHub org → Settings tab: visibility, custom roles, the legacy-campaign
// migration panel, pending transfers, the audit log, and a danger zone
// (leave / delete). Ported from the old /organizations page.
import type { CampaignPublic } from "#shared/types";

definePageMeta({ layout: "default" });
const { t } = useI18n();
const route = useRoute();
const slug = route.params.slug as string;
useHead({ title: () => `${t("orgs.tabs.settings")} · ${slug}` });

const { org, full, loading, notFound, isPrivileged, myRole, visibility, load } =
  useOrgContext(slug);
const { leave, remove } = useOrgs();

// ---------- visibility ----------
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

// ---------- migration panel ----------
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

// ---------- custom roles ----------
const customRoles = ref<{ name: string; baseRole: string }[]>([]);
const newRoleName = ref("");
const newRoleBase = ref("editor");
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
      body: { name: newRoleName.value.trim(), baseRole: newRoleBase.value },
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
    await $fetch(`/api/orgs/${org.value.id}/roles/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
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
const auditOpen = ref(false);
const auditLogs = ref<
  { id: number; action: string; target: string; actorName: string; createdAt: string }[]
>([]);
const auditLoading = ref(false);
async function openAudit() {
  if (!org.value) return;
  auditOpen.value = true;
  auditLoading.value = true;
  try {
    const data = await $fetch<{ logs: typeof auditLogs.value }>("/api/audit", {
      query: { orgId: org.value.id },
    });
    auditLogs.value = data.logs;
  } catch (e) {
    toast.error((e as Error).message);
    auditLogs.value = [];
  } finally {
    auditLoading.value = false;
  }
}

// ---------- danger zone ----------
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

onMounted(async () => {
  await load();
  if (notFound.value || !isPrivileged.value) return;
  await Promise.all([loadUnconfirmed(), loadRoles(), loadTransfers()]);
});
</script>

<template>
  <div v-if="notFound" class="py-16 text-center text-sm text-muted-foreground">
    {{ t("orgs.notFound") }}
  </div>
  <div v-else-if="loading" class="py-16 text-center text-sm text-muted-foreground">
    {{ t("settings.loading") }}
  </div>
  <div v-else-if="org && full && isPrivileged" class="flex flex-col gap-6">
    <OrgHeader :slug="org.slug" :name="org.name" :visibility="visibility" show-settings />

    <!-- visibility -->
    <Card>
      <CardHeader>
        <CardTitle>{{ t("orgs.settings.visibility") }}</CardTitle>
        <CardDescription>{{ t("orgs.settings.visibilityDesc") }}</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-wrap gap-2">
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
        <Button variant="outline" size="sm" class="ml-auto" @click="openAudit">
          <Icon spec="ScrollText" :size="14" />
          {{ t("orgs.audit.title") }}
        </Button>
      </CardContent>
    </Card>

    <!-- migration panel -->
    <Card v-if="unconfirmed.length">
      <CardHeader>
        <CardTitle class="text-amber-700 dark:text-amber-400">
          {{ t("orgs.migration.title") }} ({{ unconfirmed.length }})
        </CardTitle>
        <CardDescription>{{ t("orgs.migration.desc") }}</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-2">
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
      </CardContent>
    </Card>

    <!-- custom roles -->
    <Card>
      <CardHeader>
        <CardTitle>{{ t("orgs.customRoles.title") }}</CardTitle>
        <CardDescription>{{ t("orgs.customRoles.desc") }}</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-3">
        <div
          v-for="r in customRoles"
          :key="r.name"
          class="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm"
        >
          <span class="font-medium">{{ r.name }}</span>
          <span class="text-xs text-muted-foreground">· {{ roleLabel(r.baseRole) }}</span>
          <Button
            variant="ghost"
            size="sm"
            class="ml-auto"
            @click="deleteRole(r.name)"
            >{{ t("orgs.remove") }}</Button
          >
        </div>
        <p v-if="!customRoles.length" class="text-xs text-muted-foreground">
          {{ t("orgs.customRoles.none") }}
        </p>
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
          <Button type="submit" variant="outline" :disabled="!newRoleName.trim()">
            {{ t("home.collab.add") }}
          </Button>
        </form>
      </CardContent>
    </Card>

    <!-- pending transfers -->
    <Card v-if="transfers.length">
      <CardHeader>
        <CardTitle>{{ t("orgs.transfer.title") }}</CardTitle>
      </CardHeader>
      <CardContent class="flex flex-col gap-2">
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
          <span class="min-w-0 flex-1 truncate font-medium">{{ tr.campaign }}</span>
          <span class="text-xs text-muted-foreground">
            {{ tr.fromOrg }} → {{ tr.toOrg }}
          </span>
          <Button v-if="tr.incoming" size="sm" @click="acceptTransfer(tr.id)">{{
            t("orgs.transfer.accept")
          }}</Button>
          <Button variant="ghost" size="sm" @click="cancelTransfer(tr.id)">{{
            t("orgs.transfer.reject")
          }}</Button>
        </div>
      </CardContent>
    </Card>

    <!-- danger zone -->
    <Card class="border-destructive/40">
      <CardHeader>
        <CardTitle class="text-destructive">{{ t("orgs.danger.title") }}</CardTitle>
      </CardHeader>
      <CardContent class="flex flex-wrap gap-2">
        <Button v-if="myRole !== 'owner'" variant="outline" size="sm" @click="onLeave">
          {{ t("orgs.leave") }}
        </Button>
        <Button variant="destructive" size="sm" @click="onDelete">
          {{ t("orgs.delete") }}
        </Button>
      </CardContent>
    </Card>

    <!-- audit modal -->
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
          <div v-if="auditLoading" class="py-8 text-center text-muted-foreground">
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
            <span v-if="l.target" class="text-muted-foreground">· {{ l.target }}</span>
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
  <!-- non-privileged members get bounced to the org page -->
  <div v-else-if="org" class="py-16 text-center text-sm text-muted-foreground">
    {{ t("orgs.settings.ownersOnly") }}
  </div>
</template>
