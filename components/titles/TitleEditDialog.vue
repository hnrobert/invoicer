<script setup lang="ts">
import type { InvoiceTitlePublic } from "#shared/types";

/**
 * The unified invoice-title editor dialog — the single template used for BOTH
 * creating and editing stored titles across all three owners (personal / org /
 * site). Embeds no fetch logic: it collects the six fields and emits `save`;
 * the owner (TitleManager) performs the request and closes the dialog.
 */
const props = defineProps<{
  /** Edited row, or null when creating. */
  initial?: InvoiceTitlePublic | null;
  busy?: boolean;
}>();
const emit = defineEmits<{
  save: [
    form: {
      title: string;
      taxId: string;
      bankName: string;
      bankAccount: string;
      address: string;
      phone: string;
    },
  ];
}>();

const { t } = useI18n();
const open = defineModel<boolean>({ required: true });

const form = ref({
  title: "",
  taxId: "",
  bankName: "",
  bankAccount: "",
  address: "",
  phone: "",
});

// Re-seed the fields whenever the dialog is opened for a given target.
watch(open, (v) => {
  if (!v) return;
  const i = props.initial ?? null;
  form.value = {
    title: i?.title ?? "",
    taxId: i?.taxId ?? "",
    bankName: i?.bankName ?? "",
    bankAccount: i?.bankAccount ?? "",
    address: i?.address ?? "",
    phone: i?.phone ?? "",
  };
});

function submit() {
  if (!form.value.title.trim() && !form.value.taxId.trim()) return;
  emit("save", { ...form.value });
}

const FIELDS = [
  ["title", "titles.fieldTitle", "titles.fieldTitlePh"],
  ["taxId", "titles.fieldTax", "titles.fieldTaxPh"],
  ["bankName", "titles.fieldBank", "titles.fieldBankPh"],
  ["bankAccount", "titles.fieldAccount", "titles.fieldAccountPh"],
  ["address", "titles.fieldAddress", "titles.fieldAddressPh"],
  ["phone", "titles.fieldPhone", "titles.fieldPhonePh"],
] as const;
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle>
          {{ initial ? t("titles.edit") : t("titles.add") }}
        </DialogTitle>
        <DialogDescription>{{ t("titles.dialogDesc") }}</DialogDescription>
      </DialogHeader>
      <form class="grid gap-3 sm:grid-cols-2" @submit.prevent="submit">
        <div
          v-for="[key, label, ph] in FIELDS"
          :key="key"
          class="flex flex-col gap-1.5"
        >
          <Label>{{ t(label) }}</Label>
          <Input v-model="form[key]" :placeholder="t(ph)" class="text-sm" />
        </div>
        <DialogFooter class="col-span-full mt-1 flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            :disabled="busy"
            @click="open = false"
          >
            {{ t("common.cancel") }}
          </Button>
          <Button type="submit" size="sm" :disabled="busy">
            {{ initial ? t("titles.save") : t("titles.add") }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
