<script setup lang="ts">
import type { InvoiceTitlePublic } from "#shared/types";

// CRUD for stored invoice titles, reused for the three owners:
// personal (Settings → Titles), org (org settings → Titles), site (admin).
const props = defineProps<{
  ownerType: "user" | "org" | "site";
  orgId?: string;
  /** Optional section heading (e.g. 发票抬头 / 站点抬头) above the toolbar. */
  heading?: string;
}>();
const { t } = useI18n();

const titles = ref<InvoiceTitlePublic[]>([]);
const loading = ref(true);
const busy = ref(false);

async function load() {
  loading.value = true;
  try {
    const q =
      props.ownerType === "user"
        ? "?scope=personal"
        : props.ownerType === "site"
          ? "?scope=site"
          : `?scope=org&orgId=${props.orgId ?? ""}`;
    const data = await $fetch<{ titles: InvoiceTitlePublic[] }>(
      `/api/titles${q}`,
    );
    titles.value = data.titles;
  } catch {
    titles.value = [];
  } finally {
    loading.value = false;
  }
}

// Unified create/edit dialog (components/titles/TitleEditDialog.vue).
const dialogOpen = ref(false);
const editing = ref<InvoiceTitlePublic | null>(null);
function openCreate() {
  editing.value = null;
  dialogOpen.value = true;
}
function openEdit(row: InvoiceTitlePublic) {
  editing.value = row;
  dialogOpen.value = true;
}
async function submitDialog(form: {
  title: string;
  taxId: string;
  bankName: string;
  bankAccount: string;
  address: string;
  phone: string;
}) {
  busy.value = true;
  try {
    if (editing.value) {
      await $fetch(`/api/titles/${editing.value.id}`, {
        method: "PUT",
        body: form,
      });
    } else {
      await $fetch("/api/titles", {
        method: "POST",
        body: {
          ownerType: props.ownerType,
          orgId: props.orgId,
          ...form,
        },
      });
    }
    dialogOpen.value = false;
    await load();
  } catch (e) {
    toast.error((e as Error).message);
  } finally {
    busy.value = false;
  }
}

async function remove(id: number) {
  try {
    await $fetch(`/api/titles/${id}`, { method: "DELETE" });
    await load();
  } catch (e) {
    toast.error((e as Error).message);
  }
}

onMounted(load);
</script>

<template>
  <div class="flex flex-col gap-3">
    <div v-if="heading" class="text-base font-semibold">{{ heading }}</div>
    <!-- desc and the add button share one row, center-aligned on its midline -->
    <div class="flex items-center justify-between gap-2">
      <p class="text-sm text-muted-foreground">{{ t("titles.desc") }}</p>
      <Button size="sm" class="shrink-0" @click="openCreate">
        <Icon spec="Plus" :size="14" />
        {{ t("titles.add") }}
      </Button>
    </div>
    <div
      v-for="row in titles"
      :key="row.id"
      class="flex flex-col gap-1 rounded-lg border p-3"
    >
      <div class="flex items-center gap-2">
        <Icon
          :spec="
            ownerType === 'site'
              ? 'Landmark'
              : ownerType === 'org'
                ? 'Building2'
                : 'UserCircle'
          "
          :size="16"
          class="text-muted-foreground"
        />
        <span class="text-sm font-medium">{{ row.title || "—" }}</span>
        <span class="font-mono text-xs text-muted-foreground">{{
          row.taxId || "—"
        }}</span>
        <div class="ml-auto flex gap-1">
          <Button variant="outline" size="sm" @click="openEdit(row)">
            {{ t("titles.edit") }}
          </Button>
          <Button variant="ghost" size="sm" @click="remove(row.id)">
            {{ t("titles.delete") }}
          </Button>
        </div>
      </div>
      <div
        v-if="row.bankName || row.bankAccount || row.address || row.phone"
        class="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground"
      >
        <span v-if="row.bankName"
          >{{ t("titles.fieldBank") }}: {{ row.bankName }}</span
        >
        <span v-if="row.bankAccount"
          >{{ t("titles.fieldAccount") }}: {{ row.bankAccount }}</span
        >
        <span v-if="row.address"
          >{{ t("titles.fieldAddress") }}: {{ row.address }}</span
        >
        <span v-if="row.phone"
          >{{ t("titles.fieldPhone") }}: {{ row.phone }}</span
        >
      </div>
    </div>
    <p v-if="!loading && !titles.length" class="text-xs text-muted-foreground">
      {{ t("titles.none") }}
    </p>

    <!-- unified add / edit dialog -->
    <TitleEditDialog
      v-model="dialogOpen"
      :initial="editing"
      :busy="busy"
      @save="submitDialog"
    />
  </div>
</template>
