<script setup lang="ts">
import type { OrgFull, OrgRole } from "#shared/types";
import { useOrgs } from "~/composables/useOrgs";

definePageMeta({ layout: "default" });
const { t } = useI18n();
useHead({ title: () => t("orgs.title") });

const {
  ORG_ROLES,
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

onMounted(load);
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- breadcrumb -->
    <div class="flex items-center gap-2 text-sm text-muted-foreground">
      <NuxtLink to="/" class="hover:text-foreground"
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
        <div class="flex gap-2">
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
              <option
                v-for="r in ORG_ROLES.filter((x) => x !== 'owner')"
                :key="r"
                :value="r"
              >
                {{ roleLabel(r) }}
              </option>
            </select>
          </div>
          <Button :disabled="inviting || !inviteEmail.trim()" @click="onInvite">
            <Icon spec="UserPlus" :size="14" />
            {{ inviting ? t("orgs.inviting") : t("orgs.inviteSend") }}
          </Button>
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
                    <option
                      v-for="r in ORG_ROLES.filter((x) => x !== 'owner')"
                      :key="r"
                      :value="r"
                    >
                      {{ roleLabel(r) }}
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
  </div>
</template>
