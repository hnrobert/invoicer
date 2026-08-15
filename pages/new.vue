<script setup lang="ts">
// GitHub-style "New" page: create a campaign (scope picker incl. orgs) or —
// via the #org anchor — a new organization. On success, redirect to the new
// campaign's repo-style page (or the org page).
definePageMeta({ layout: "default" });
const { t } = useI18n();
useHead({ title: () => t("nav.new") });
const route = useRoute();
const inv = useInvoice();
const { organizations, refresh: refreshOrgs, create: createOrg } = useOrgs();

const creating = ref(false);
const scope = ref<string | null>(null);
const title = ref("");
const taxId = ref("");
const campaignName = ref("");

// new org form (shown when arriving with #org or toggled)
const showOrgForm = ref(route.hash === "#org");
const newName = ref("");
const newSlug = ref("");
const creatingOrg = ref(false);

onMounted(() => {
  scope.value = organizations.value[0]?.id ?? null;
});

async function submitCampaign() {
  if (!title.value.trim() && !taxId.value.trim()) {
    toast.error(t("home.step1.needOne"));
    return;
  }
  creating.value = true;
  try {
    const campaignId = await inv.createCampaign(
      title.value.trim(),
      taxId.value.trim(),
      {
        organizationId: scope.value,
        name: campaignName.value.trim(),
      },
    );
    const org = organizations.value.find((o) => o.id === scope.value);
    navigateTo(
      org ? `/orgs/${org.slug}/campaigns/${campaignId}` : `/personal/${campaignId}`,
      { replace: true },
    );
  } catch (e) {
    toast.error((e as Error).message || t("home.step1.createFailed"));
  } finally {
    creating.value = false;
  }
}

async function submitOrg() {
  if (!newName.value.trim() || !newSlug.value.trim()) return;
  creatingOrg.value = true;
  try {
    await createOrg(newName.value.trim(), newSlug.value.trim().toLowerCase());
    await refreshOrgs();
    toast.success(t("orgs.title"));
    showOrgForm.value = false;
    newName.value = "";
    newSlug.value = "";
  } catch (e) {
    toast.error(messageFromError(e, t("orgs.createFailed")));
  } finally {
    creatingOrg.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-xl">
    <div class="mb-6 flex gap-2 border-b pb-3">
      <button
        type="button"
        class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
        :class="!showOrgForm ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'"
        @click="showOrgForm = false"
      >
        {{ t("nav.newCampaign") }}
      </button>
      <button
        type="button"
        class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
        :class="showOrgForm ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'"
        @click="showOrgForm = true"
      >
        {{ t("nav.newOrg") }}
      </button>
    </div>

    <!-- new campaign -->
    <div v-if="!showOrgForm" class="flex flex-col gap-4">
      <div class="flex flex-col gap-2">
        <Label>{{ t("home.step1.scopeLabel") }}</Label>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
            :class="
              scope === null
                ? 'border-primary bg-primary text-primary-foreground'
                : 'hover:bg-accent'
            "
            @click="scope = null"
          >
            <Icon spec="User" :size="14" />
            {{ t("home.scope.personal") }}
          </button>
          <button
            v-for="o in organizations"
            :key="o.id"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
            :class="
              scope === o.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'hover:bg-accent'
            "
            @click="scope = o.id"
          >
            <Icon spec="Building2" :size="14" />
            {{ o.name }}
          </button>
        </div>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="flex flex-col gap-2">
          <Label>{{ t("home.step1.nameLabel") }}</Label>
          <Input
            v-model="campaignName"
            :placeholder="t('home.step1.namePlaceholder')"
          />
        </div>
        <div class="flex flex-col gap-2">
          <Label>{{ t("home.step1.taxLabel") }}</Label>
          <Input
            v-model="taxId"
            :placeholder="t('home.step1.taxPlaceholder')"
          />
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <Label>{{ t("home.step1.titleLabel") }}</Label>
        <Input
          v-model="title"
          :placeholder="t('home.step1.titlePlaceholder')"
        />
      </div>
      <Button :disabled="creating" @click="submitCampaign">
        <Icon spec="FolderPlus" :size="16" />
        {{ creating ? t("home.step1.creating") : t("nav.newCampaign") }}
      </Button>
    </div>

    <!-- new org -->
    <div v-else class="flex flex-col gap-4">
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="flex flex-col gap-2">
          <Label>{{ t("orgs.nameLabel") }}</Label>
          <Input
            v-model="newName"
            :placeholder="t('orgs.namePlaceholder')"
          />
        </div>
        <div class="flex flex-col gap-2">
          <Label>{{ t("orgs.slugLabel") }}</Label>
          <Input
            v-model="newSlug"
            :placeholder="t('orgs.slugPlaceholder')"
          />
        </div>
      </div>
      <p class="text-xs text-muted-foreground">{{ t("orgs.slugHint") }}</p>
      <Button :disabled="creatingOrg || !newName.trim() || !newSlug.trim()" @click="submitOrg">
        <Icon spec="Building2" :size="16" />
        {{ creatingOrg ? t("orgs.creating") : t("orgs.create") }}
      </Button>
    </div>
  </div>
</template>
