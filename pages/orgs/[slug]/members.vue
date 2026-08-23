<script setup lang="ts">
// GitHub org → Members tab: invite / change role / remove (ported from the
// old /organizations page). Custom roles appear as base role + name.
import type { OrgRole } from "#shared/types";

definePageMeta({ layout: "default" });
const { t } = useI18n();
const route = useRoute();
const slug = route.params.slug as string;
useHead({ title: () => `${t("orgs.members")} · ${slug}` });

const {
  invite,
  removeMember,
  updateMemberRole,
  acceptInvitation,
  rejectInvitation,
  myInvitations,
  refresh: refreshOrgs,
} = useOrgs();
const { org, full, loading, notFound, isPrivileged, myRole, visibility, load } =
  useOrgContext(slug);

const inviteEmail = ref("");
const inviteRole = ref<OrgRole>("member");
const inviting = ref(false);

// Custom roles (name → base) for the role dropdowns.
const customRoles = ref<{ name: string; baseRole: string }[]>([]);
const assignable = computed(() => [
  "admin",
  "editor",
  "viewer",
  "member",
  ...customRoles.value.map((r) => r.name),
]);
function roleDisplay(r: string): string {
  if (["owner", "admin", "editor", "viewer", "member"].includes(r))
    return roleLabel(r);
  const custom = customRoles.value.find((c) => c.name === r);
  return custom ? `${r} (${roleLabel(custom.baseRole)})` : r;
}
function roleLabel(r: string): string {
  switch (r) {
    case "owner":
      return t("orgs.role.owner");
    case "admin":
      return t("orgs.role.admin");
    case "editor":
      return t("orgs.role.editor");
    case "supervisor":
      return t("orgs.role.supervisor");
    case "viewer":
      return t("orgs.role.viewer");
    default:
      return t("orgs.role.member");
  }
}

async function reload() {
  await load();
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

async function onInvite() {
  if (!org.value || !inviteEmail.value.trim()) return;
  inviting.value = true;
  try {
    await invite(inviteEmail.value.trim(), inviteRole.value, org.value.id);
    await load();
    inviteEmail.value = "";
    toast.success(t("orgs.inviteSend"));
  } catch (e) {
    toast.error(messageFromError(e, t("orgs.inviteFailed")));
  } finally {
    inviting.value = false;
  }
}
async function onChangeRole(memberId: string, role: OrgRole) {
  try {
    await updateMemberRole(memberId, role);
    await load();
  } catch (e) {
    toast.error(messageFromError(e, t("orgs.inviteFailed")));
  }
}
async function onRemoveMember(memberId: string) {
  if (!org.value) return;
  try {
    await removeMember(memberId);
    await load();
  } catch (e) {
    toast.error(messageFromError(e, t("orgs.remove")));
  }
}
async function onAccept(id: string) {
  try {
    await acceptInvitation(id);
    toast.success(t("orgs.accepted"));
    await refreshOrgs();
    await load();
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

onMounted(reload);
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
  <div v-else-if="org && full" class="flex flex-col gap-6">
    <OrgHeader
      :slug="org.slug"
      :name="org.name"
      :visibility="visibility"
      :show-settings="isPrivileged"
    />

    <!-- invite (privileged only) -->
    <div
      v-if="isPrivileged"
      class="flex flex-col gap-2 sm:flex-row sm:items-end"
    >
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
          <option v-for="r in assignable" :key="r" :value="r">
            {{ roleDisplay(r) }}
          </option>
        </select>
      </div>
      <Button :disabled="inviting || !inviteEmail.trim()" @click="onInvite">
        <Icon spec="UserPlus" :size="14" />
        {{ inviting ? t("orgs.inviting") : t("orgs.inviteSend") }}
      </Button>
    </div>

    <!-- members table -->
    <div class="overflow-x-auto rounded-lg border">
      <table class="w-full text-sm">
        <thead class="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th class="px-3 py-2 font-medium">
              {{ t("auth.register.emailLabel") }}
            </th>
            <th class="px-3 py-2 font-medium">
              {{ t("auth.register.nameLabel") }}
            </th>
            <th class="px-3 py-2 font-medium">{{ t("orgs.inviteRole") }}</th>
            <th v-if="isPrivileged" class="px-3 py-2 text-right font-medium">
              {{ t("home.table.action") }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="m in full.members"
            :key="m.id"
            class="border-t last:border-0 hover:bg-accent/30"
          >
            <td class="px-3 py-2">{{ m.user.email }}</td>
            <td class="px-3 py-2 text-muted-foreground">{{ m.user.name }}</td>
            <td class="px-3 py-2">
              <select
                v-if="m.role !== 'owner' && isPrivileged"
                :value="m.role"
                class="h-8 rounded-md border bg-background px-2 text-xs"
                @change="
                  onChangeRole(
                    m.id,
                    ($event.target as HTMLSelectElement).value as OrgRole,
                  )
                "
              >
                <option v-for="r in assignable" :key="r" :value="r">
                  {{ roleDisplay(r) }}
                </option>
              </select>
              <span v-else class="font-medium text-primary">{{
                roleDisplay(m.role)
              }}</span>
            </td>
            <td v-if="isPrivileged" class="px-3 py-2 text-right">
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

    <!-- pending invitations (my own, for this org) -->
    <div v-if="myInvitations.some((i) => i.organizationId === org?.id)">
      <h3 class="mb-2 text-sm font-medium">{{ t("orgs.invitations") }}</h3>
      <div
        v-for="inv in myInvitations.filter((i) => i.organizationId === org?.id)"
        :key="inv.id"
        class="flex items-center gap-3 rounded-lg border p-3 text-sm"
      >
        <span class="flex-1 truncate">{{ inv.email }}</span>
        <Button variant="outline" size="sm" @click="onAccept(inv.id)">{{
          t("orgs.accept")
        }}</Button>
        <Button variant="ghost" size="sm" @click="onReject(inv.id)">{{
          t("orgs.reject")
        }}</Button>
      </div>
    </div>
  </div>
</template>
