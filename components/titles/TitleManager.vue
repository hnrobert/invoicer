<script setup lang="ts">
import type { InvoiceTitlePublic } from "#shared/types";

// CRUD for stored invoice titles, reused for the three owners:
// personal (Settings → Titles), org (org settings → Titles), site (admin).
const props = defineProps<{
  ownerType: "user" | "org" | "site";
  orgId?: string;
}>();
const { t } = useI18n();

const titles = ref<InvoiceTitlePublic[]>([]);
const loading = ref(true);
const busy = ref(false);
const editingId = ref<number | null>(null);
const form = ref({
  title: "",
  taxId: "",
  bankName: "",
  bankAccount: "",
  address: "",
  phone: "",
});

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

function startEdit(t: InvoiceTitlePublic | null) {
  editingId.value = t?.id ?? null;
  form.value = {
    title: t?.title ?? "",
    taxId: t?.taxId ?? "",
    bankName: t?.bankName ?? "",
    bankAccount: t?.bankAccount ?? "",
    address: t?.address ?? "",
    phone: t?.phone ?? "",
  };
}
function resetForm() {
  editingId.value = null;
  form.value = {
    title: "",
    taxId: "",
    bankName: "",
    bankAccount: "",
    address: "",
    phone: "",
  };
}

async function submit() {
  if (!form.value.title.trim() && !form.value.taxId.trim()) return;
  busy.value = true;
  try {
    if (editingId.value) {
      await $fetch(`/api/titles/${editingId.value}`, {
        method: "PUT",
        body: form.value,
      });
    } else {
      await $fetch("/api/titles", {
        method: "POST",
        body: {
          ownerType: props.ownerType,
          orgId: props.orgId,
          ...form.value,
        },
      });
    }
    resetForm();
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

const FIELDS = [
  ["title", "titles.fieldTitle", "titles.fieldTitlePh"],
  ["taxId", "titles.fieldTax", "titles.fieldTaxPh"],
  ["bankName", "titles.fieldBank", "titles.fieldBankPh"],
  ["bankAccount", "titles.fieldAccount", "titles.fieldAccountPh"],
  ["address", "titles.fieldAddress", "titles.fieldAddressPh"],
  ["phone", "titles.fieldPhone", "titles.fieldPhonePh"],
] as const;

onMounted(load);
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="text-sm text-muted-foreground">{{ t("titles.desc") }}</p>
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
          <Button variant="outline" size="sm" @click="startEdit(row)">
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

    <!-- add / edit form -->
    <form
      class="flex flex-col gap-3 rounded-lg border border-dashed p-3"
      @submit.prevent="submit"
    >
      <div class="text-xs font-medium text-muted-foreground">
        {{ editingId ? t("titles.editing") : t("titles.add") }}
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div
          v-for="[key, label, ph] in FIELDS"
          :key="key"
          class="flex flex-col gap-1.5"
        >
          <Label>{{ t(label) }}</Label>
          <Input v-model="form[key]" :placeholder="t(ph)" class="text-sm" />
        </div>
      </div>
      <div class="flex gap-2">
        <Button type="submit" size="sm" :disabled="busy">
          {{ editingId ? t("titles.save") : t("titles.add") }}
        </Button>
        <Button
          v-if="editingId"
          type="button"
          variant="ghost"
          size="sm"
          @click="resetForm"
        >
          {{ t("common.cancel") }}
        </Button>
      </div>
    </form>
  </div>
</template>
