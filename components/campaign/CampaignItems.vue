<script setup lang="ts">
// Reimbursement items (报销条目) — the campaign's default tab. ONE project
// per item (its invoice plus same-price quotation/receipt evidence); invoice
// files attach as attributes. No budget concept anywhere. Pure view + forms:
// all state/API calls live in the parent (CampaignDetail) so the files-tab
// row selects share one source.
import type { ItemCreateBody, ItemPublic } from "#shared/api";
import type { InvoicePublic } from "#shared/types";

const { t } = useI18n();

const props = defineProps<{
  items: ItemPublic[];
  groups: { id: number; name: string }[];
  invoices: InvoicePublic[];
  canManage: boolean;
}>();

const emit = defineEmits<{
  create: [payload: ItemCreateBody];
  update: [itemId: number, payload: ItemCreateBody];
  remove: [itemId: number];
  attach: [invoiceIds: number[], itemId: number | null];
}>();

// ---------- display helpers ----------
function fmt(n: number | null | undefined, digits = 2): string {
  return n == null ? "—" : n.toFixed(digits);
}
function groupName(gid: number | null): string {
  return gid == null
    ? ""
    : (props.groups.find((g) => g.id === gid)?.name ?? "");
}
/** Completeness badges: 缺发票 / 缺佐证 — driven by the item's own
 * requirement flags (requireInvoice / requireEvidence, editable in the
 * inline form below); flags default ON for every item. */
function missingDocs(it: ItemPublic): string[] {
  const miss: string[] = [];
  if (it.requireInvoice !== false && !it.hasInvoice) miss.push("invoice");
  if (it.requireEvidence !== false && !it.hasEvidence) miss.push("evidence");
  return miss;
}

/** Invoice total vs evidence (order-screenshot) total — warn when both
 * are known and differ (OCR drift or a genuinely missing piece). */
function amountMismatch(it: ItemPublic): { inv: number; ev: number } | null {
  if (it.actualTotal == null || it.evidenceTotal == null) return null;
  return Math.abs(it.actualTotal - it.evidenceTotal) > 0.005
    ? { inv: it.actualTotal, ev: it.evidenceTotal }
    : null;
}
// group filter: chips above the list (全部 / each group)
const groupFilter = ref<number | "all">("all");
// payer filter: second chip row — each badge shows the person's advance
// total (their items' actual totals), right inside the badge.
const payerFilter = ref<string | "all">("all");
const payers = computed(() => {
  // scoped to the current group filter — the badges answer "who advanced
  // what IN THIS VIEW", not campaign-wide.
  const scope =
    groupFilter.value === "all"
      ? props.items
      : props.items.filter((i) => i.groupId === groupFilter.value);
  const totals = new Map<string, number>();
  for (const it of scope) {
    if (!it.payer) continue;
    totals.set(it.payer, (totals.get(it.payer) ?? 0) + (it.actualTotal ?? 0));
  }
  return [...totals.entries()]
    .map(([name, total]) => ({
      name,
      total: Math.round(total * 100) / 100,
    }))
    .sort((a, b) => b.total - a.total);
});
const filteredItems = computed(() =>
  props.items.filter(
    (i) =>
      (groupFilter.value === "all" || i.groupId === groupFilter.value) &&
      (payerFilter.value === "all" || i.payer === payerFilter.value),
  ),
);
const sumActual = computed(() => {
  const xs = filteredItems.value
    .map((i) => i.actualTotal)
    .filter((x): x is number => x != null);
  return xs.length
    ? Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100
    : null;
});

// ---------- expand + edit ----------
const expanded = ref<number | null>(null);
function toggle(id: number) {
  expanded.value = expanded.value === id ? null : id;
  if (expanded.value != null) {
    const it = props.items.find((x) => x.id === expanded.value);
    if (it) fillForm(it);
  }
}
/** draft form, shared by create + edit (editingId null = create). */
const editingId = ref<number | null>(null);
const form = reactive({
  name: "",
  groupId: "" as number | "",
  payer: "",
  note: "",
  requireInvoice: true,
  requireEvidence: true,
});
function fillForm(it: ItemPublic) {
  editingId.value = it.id;
  form.name = it.name;
  form.groupId = it.groupId ?? "";
  form.payer = it.payer ?? "";
  form.note = it.note ?? "";
  form.requireInvoice = it.requireInvoice !== false;
  form.requireEvidence = it.requireEvidence !== false;
}
function resetForm() {
  editingId.value = null;
  form.name = "";
  form.groupId = "";
  form.payer = "";
  form.note = "";
  form.requireInvoice = true;
  form.requireEvidence = true;
}
function submitForm() {
  const payload: ItemCreateBody = {
    name: form.name,
    groupId: form.groupId === "" ? null : Number(form.groupId),
    payer: form.payer,
    note: form.note,
    requireInvoice: form.requireInvoice,
    requireEvidence: form.requireEvidence,
  };
  if (editingId.value != null) emit("update", editingId.value, payload);
  else emit("create", payload);
  resetForm();
}
function removeItem(it: ItemPublic) {
  if (!confirm(t("campaign.items.deleteConfirm", { name: it.name }))) return;
  emit("remove", it.id);
}

// ---------- attach / detach ----------
function attachedOf(it: ItemPublic): InvoicePublic[] {
  return props.invoices.filter((r) => r.itemId === it.id);
}
const unattached = computed(() =>
  props.invoices.filter((r) => r.itemId == null),
);
const attachPick = ref<Record<number, string>>({});
function attach(it: ItemPublic) {
  const v = attachPick.value[it.id];
  if (!v) return;
  emit("attach", [Number(v)], it.id);
  attachPick.value[it.id] = "";
}
function detach(it: ItemPublic, invoiceId: number) {
  emit("attach", [invoiceId], null);
}

function statusCls(s: string): string {
  if (s === "qualified") return "text-emerald-600 dark:text-emerald-400";
  if (s === "manual") return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}
function statusLabel(s: string): string {
  return t(`home.status.${s}`);
}
function counted(i: InvoicePublic): number | null {
  return i.extractedAmount ?? i.manualAmount;
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- totals strip -->
    <div
      v-if="items.length"
      class="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm"
    >
      <span class="text-muted-foreground">{{
        t("campaign.items.count", { n: items.length })
      }}</span>
      <span>
        {{ t("campaign.items.sumActual") }}
        <span class="font-mono font-medium">{{
          sumActual == null ? "—" : fmt(sumActual)
        }}</span>
      </span>
    </div>

    <!-- group filter chips -->
    <div
      v-if="groups.length > 1 && items.length"
      class="flex flex-wrap items-center gap-1.5"
    >
      <button
        type="button"
        class="rounded-full border px-2.5 py-1 text-xs transition-colors"
        :class="
          groupFilter === 'all'
            ? 'border-primary bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent'
        "
        @click="groupFilter = 'all'"
      >
        {{ t("campaign.items.allGroups") }}
      </button>
      <button
        v-for="g in groups"
        :key="g.id"
        type="button"
        class="rounded-full border px-2.5 py-1 text-xs transition-colors"
        :class="
          groupFilter === g.id
            ? 'border-primary bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent'
        "
        @click="groupFilter = g.id"
      >
        {{ g.name }}
      </button>
    </div>

    <!-- payer filter chips (below the group row) -->
    <div v-if="payers.length" class="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        class="rounded-full border px-2.5 py-1 text-xs transition-colors"
        :class="
          payerFilter === 'all'
            ? 'border-primary bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent'
        "
        @click="payerFilter = 'all'"
      >
        {{ t("campaign.items.allPayers") }}
      </button>
      <button
        v-for="p in payers"
        :key="p.name"
        type="button"
        class="rounded-full border px-2.5 py-1 text-xs transition-colors"
        :class="
          payerFilter === p.name
            ? 'border-primary bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent'
        "
        @click="payerFilter = p.name"
      >
        {{ p.name }}
        <span class="font-mono">¥{{ p.total.toFixed(2) }}</span>
      </button>
    </div>

    <!-- item rows -->
    <div v-if="items.length" class="overflow-hidden rounded-lg border">
      <div
        v-for="it in filteredItems"
        :key="it.id"
        class="border-t first:border-t-0"
      >
        <button
          type="button"
          class="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/40"
          @click="toggle(it.id)"
        >
          <Icon
            :spec="expanded === it.id ? 'ChevronDown' : 'ChevronRight'"
            :size="14"
            class="shrink-0 text-muted-foreground"
          />
          <span class="font-medium">{{ it.name }}</span>
          <span
            v-if="groupName(it.groupId)"
            class="rounded-full border border-sky-500/40 px-2 py-px text-[11px] text-sky-700 dark:text-sky-400"
            >{{ groupName(it.groupId) }}</span
          >
          <span v-if="it.payer" class="text-xs text-muted-foreground"
            >{{ t("campaign.items.payer") }}: {{ it.payer }}</span
          >
          <span
            v-else
            class="text-xs text-muted-foreground/60 hover:text-muted-foreground"
            >+ {{ t("campaign.items.payer") }}</span
          >
          <span
            v-for="miss in missingDocs(it)"
            :key="miss"
            class="flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:text-rose-400"
          >
            <Icon spec="FileWarning" :size="12" />
            {{
              miss === "invoice"
                ? t("campaign.items.needInvoice")
                : t("campaign.items.needEvidence")
            }}
          </span>
          <span
            v-if="amountMismatch(it)"
            class="flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
            :title="t('campaign.items.mismatchHint')"
          >
            <Icon spec="TriangleAlert" :size="12" />
            {{
              t("campaign.items.mismatch", {
                inv: amountMismatch(it)!.inv,
                ev: amountMismatch(it)!.ev,
              })
            }}
          </span>
          <span class="ml-auto flex items-center gap-3">
            <span
              v-if="!it.invoiceCount"
              class="rounded-full border border-muted-foreground/30 px-2 py-0.5 text-[11px] text-muted-foreground"
              >{{ t("campaign.items.noInvoice") }}</span
            >
            <span
              v-else
              class="rounded-full bg-accent px-2 py-px text-[11px] text-muted-foreground"
              >{{ it.invoiceCount }}</span
            >
            <span class="text-xs"
              >{{ t("campaign.items.actual") }}
              <span class="font-mono font-medium">{{
                fmt(it.actualTotal)
              }}</span></span
            >
          </span>
        </button>

        <!-- expanded: evidence + inline edit -->
        <div v-if="expanded === it.id" class="border-t bg-accent/20 px-3 py-3">
          <div class="flex flex-col gap-2 text-sm">
            <div
              v-for="r in attachedOf(it)"
              :key="r.id"
              class="flex flex-wrap items-center gap-x-3 gap-y-1"
            >
              <Icon
                :spec="r.kind === 'invoice' ? 'FileText' : 'ClipboardList'"
                :size="13"
                class="text-muted-foreground"
              />
              <span class="max-w-60 truncate" :title="r.filename">{{
                r.filename
              }}</span>
              <span
                v-if="r.kind !== 'invoice'"
                class="rounded-full border border-sky-500/40 px-2 py-px text-[11px] text-sky-700 dark:text-sky-400"
                >{{
                  r.kind === "quotation"
                    ? t("home.kind.quotation")
                    : t("home.kind.receipt")
                }}</span
              >
              <span class="font-mono text-xs">{{
                counted(r) == null ? "—" : fmt(counted(r))
              }}</span>
              <span class="text-xs" :class="statusCls(r.status)">{{
                statusLabel(r.status)
              }}</span>
              <button
                v-if="canManage"
                type="button"
                class="ml-auto text-xs text-muted-foreground hover:text-foreground"
                @click="detach(it, r.id)"
              >
                {{ t("campaign.items.detach") }}
              </button>
            </div>
            <p
              v-if="!attachedOf(it).length"
              class="text-xs text-muted-foreground"
            >
              {{ t("campaign.items.noInvoiceNote") }}
            </p>

            <div
              v-if="canManage && unattached.length"
              class="flex items-center gap-2 pt-1"
            >
              <select
                v-model="attachPick[it.id]"
                class="max-w-55 rounded-md border bg-background px-2 py-1 text-xs"
              >
                <option value="">{{ t("campaign.items.pickFile") }}</option>
                <option v-for="r in unattached" :key="r.id" :value="r.id">
                  {{ r.filename }}
                </option>
              </select>
              <Button
                size="sm"
                variant="outline"
                :disabled="!attachPick[it.id]"
                @click="attach(it)"
              >
                {{ t("campaign.items.attach") }}
              </Button>
            </div>
          </div>

          <!-- inline edit form -->
          <div v-if="canManage" class="mt-3 border-t pt-3">
            <div class="grid gap-2 sm:grid-cols-3">
              <label class="flex flex-col gap-1 text-xs">
                {{ t("campaign.items.name") }}
                <Input v-model="form.name" class="h-8 text-sm" />
              </label>
              <label class="flex flex-col gap-1 text-xs">
                {{ t("campaign.items.channel") }}
                <select
                  v-model="form.groupId"
                  class="h-8 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">—</option>
                  <option v-for="g in groups" :key="g.id" :value="g.id">
                    {{ g.name }}
                  </option>
                </select>
              </label>
              <label class="flex flex-col gap-1 text-xs">
                {{ t("campaign.items.payer") }}
                <Input v-model="form.payer" class="h-8 text-sm" />
              </label>
              <label class="flex flex-col gap-1 text-xs sm:col-span-3">
                {{ t("campaign.items.note") }}
                <Input v-model="form.note" class="h-8 text-sm" />
              </label>
              <div class="flex items-center gap-4 text-xs sm:col-span-3">
                <label class="flex items-center gap-1.5">
                  <input
                    v-model="form.requireInvoice"
                    type="checkbox"
                    class="size-4 accent-(--color-primary)"
                  />
                  {{ t("campaign.items.reqInvoice") }}
                </label>
                <label class="flex items-center gap-1.5">
                  <input
                    v-model="form.requireEvidence"
                    type="checkbox"
                    class="size-4 accent-(--color-primary)"
                  />
                  {{ t("campaign.items.reqEvidence") }}
                </label>
              </div>
            </div>
            <div class="mt-2 flex gap-2">
              <Button
                size="sm"
                :disabled="!form.name.trim()"
                @click="submitForm"
              >
                {{ t("titles.save") }}
              </Button>
              <Button
                v-if="editingId != null"
                size="sm"
                variant="ghost"
                @click="resetForm"
              >
                {{ t("common.cancel") }}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                class="ml-auto text-red-600 hover:text-red-500 dark:text-red-400"
                @click="removeItem(it)"
              >
                {{ t("campaign.items.delete") }}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <p v-else class="text-sm text-muted-foreground">
      {{ t("campaign.items.empty") }}
    </p>

    <!-- new item form (manager only) -->
    <form
      v-if="canManage"
      class="flex flex-wrap items-end gap-2 rounded-lg border p-3"
      @submit.prevent="submitForm"
    >
      <label class="flex min-w-40 flex-col gap-1 text-xs">
        {{ t("campaign.items.name") }}
        <Input v-model="form.name" class="h-8 text-sm" required />
      </label>
      <label class="flex flex-col gap-1 text-xs">
        {{ t("campaign.items.channel") }}
        <select
          v-model="form.groupId"
          class="h-8 rounded-md border bg-background px-2 text-sm"
        >
          <option value="">—</option>
          <option v-for="g in groups" :key="g.id" :value="g.id">
            {{ g.name }}
          </option>
        </select>
      </label>
      <label class="flex w-28 flex-col gap-1 text-xs">
        {{ t("campaign.items.payer") }}
        <Input v-model="form.payer" class="h-8 text-sm" />
      </label>
      <label class="flex min-w-40 flex-1 flex-col gap-1 text-xs">
        {{ t("campaign.items.note") }}
        <Input v-model="form.note" class="h-8 text-sm" />
      </label>
      <Button type="submit" size="sm" :disabled="!form.name.trim()">
        <Icon spec="Plus" :size="14" />
        {{ t("campaign.items.new") }}
      </Button>
    </form>
  </div>
</template>
