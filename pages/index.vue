<script setup lang="ts">
import type { CampaignPublic, InvoicePublic } from "#shared/types";

definePageMeta({ layout: "default" });
const { t } = useI18n();
useHead({ title: () => t("home.title") });

const inv = useInvoice();
const { organizations, activeOrganization } = useOrgs();

// ---------- step 1: scope + info + campaigns ----------
// scope: null = personal, otherwise an org id the user belongs to. Defaults to
// the active organization if one is set, else personal.
const scope = ref<string | null>(null);
const title = ref("");
const taxId = ref("");
const campaignName = ref("");
const creating = ref(false);

// Resumable campaigns accessible to the caller (personal + org-scoped).
const personalCampaigns = ref<CampaignPublic[]>([]);
const orgCampaigns = ref<CampaignPublic[]>([]);

async function loadCampaigns() {
  try {
    const { personal, organizations: orgs } = await listCampaigns();
    personalCampaigns.value = personal;
    orgCampaigns.value = orgs;
  } catch {
    // Not fatal — the list just stays empty until refresh.
  }
}

function orgName(id: string | null): string {
  if (!id) return t("home.scope.personal");
  return organizations.value.find((o) => o.id === id)?.name ?? t("home.scope.org");
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

async function createCampaign() {
  if (!title.value && !taxId.value) {
    toast.error(t("home.step1.needOne"));
    return;
  }
  creating.value = true;
  try {
    await inv.createCampaign(title.value.trim(), taxId.value.trim(), {
      organizationId: scope.value,
      name: campaignName.value.trim(),
    });
    step2.value = true;
    step3.value = false;
    await nextTick();
    document
      .getElementById("step-upload")
      ?.scrollIntoView({ behavior: "smooth" });
    void loadCampaigns();
  } catch (e) {
    toast.error((e as Error).message || t("home.step1.createFailed"));
  } finally {
    creating.value = false;
  }
}

async function resumeCampaign(c: CampaignPublic) {
  try {
    await inv.resume(c.id);
    scope.value = c.organizationId;
    step2.value = true;
    step3.value = inv.invoices.value.length > 0;
    await nextTick();
    document
      .getElementById(inv.invoices.value.length > 0 ? "step-result" : "step-upload")
      ?.scrollIntoView({ behavior: "smooth" });
  } catch (e) {
    toast.error((e as Error).message);
  }
}

// ---------- step 2: upload ----------
const step2 = ref(false);
const step3 = ref(false);
const selectedFiles = ref<File[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);
const uploading = ref(false);

function pickFiles(list: FileList | null) {
  if (!list) return;
  selectedFiles.value = Array.from(list).filter((f) =>
    /\.(pdf|jpe?g|png|webp|bmp|gif|tiff?)$/i.test(f.name),
  );
}
function onDrop(e: DragEvent) {
  dragOver.value = false;
  pickFiles(e.dataTransfer?.files ?? null);
}
async function startUpload() {
  if (!inv.campaignId.value || selectedFiles.value.length === 0) return;
  uploading.value = true;
  try {
    await inv.upload(selectedFiles.value);
    step3.value = true;
    await nextTick();
    document
      .getElementById("step-result")
      ?.scrollIntoView({ behavior: "smooth" });
  } catch (e) {
    toast.error(t("home.step2.uploadFailed") + (e as Error).message);
  } finally {
    uploading.value = false;
  }
}
async function resetUpload() {
  if (!confirm(t("home.step2.resetConfirm"))) return;
  await inv.clearAll();
  selectedFiles.value = [];
  step3.value = false;
  await nextTick();
  document
    .getElementById("step-upload")
    ?.scrollIntoView({ behavior: "smooth" });
}

onUnmounted(() => inv.stopPolling());

// ---------- step 3: results ----------
const expanded = ref<Set<number>>(new Set());
function toggleExpand(id: number) {
  const s = new Set(expanded.value);
  s.has(id) ? s.delete(id) : s.add(id);
  expanded.value = s;
}

function fmtAmount(i: InvoicePublic): string {
  const amt = i.extractedAmount ?? i.manualAmount;
  return amt != null ? `¥${amt.toFixed(2)}` : t("common.dash");
}
function isManual(i: InvoicePublic): boolean {
  return i.extractedAmount == null && i.manualAmount != null;
}

// Status → badge color. Status → localized label (static switch so vue-i18n's
// typed message keys stay satisfied; noUncheckedIndexedAccess needs the fallback).
const STATUS_CLS: Record<string, string> = {
  qualified: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  review: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  unqualified: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  pending: "bg-muted text-muted-foreground",
  processing: "bg-muted text-muted-foreground",
  error: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
};
function statusCls(s: string): string {
  return STATUS_CLS[s] ?? "bg-muted text-muted-foreground";
}
function statusLabel(s: string): string {
  switch (s) {
    case "qualified":
      return t("home.status.qualified");
    case "review":
      return t("home.status.review");
    case "unqualified":
      return t("home.status.unqualified");
    case "pending":
      return t("home.status.pending");
    case "processing":
      return t("home.status.processing");
    default:
      return t("home.status.error");
  }
}

const FILTERS = [
  { key: "all", labelKey: "home.filters.all" },
  { key: "qualified", labelKey: "home.filters.qualified" },
  { key: "review", labelKey: "home.filters.review" },
  { key: "unqualified", labelKey: "home.filters.unqualified" },
] as const;

// ---------- manual review modal ----------
const reviewModal = ref(false);
const reviewTarget = ref<InvoicePublic | null>(null);
const manualAmountInput = ref<string>("");
function openReview(i: InvoicePublic) {
  reviewTarget.value = i;
  manualAmountInput.value =
    i.manualAmount != null ? String(i.manualAmount) : "";
  reviewModal.value = true;
}
async function submitReview(decision: "qualified" | "unqualified") {
  const tg = reviewTarget.value;
  if (!tg) return;
  let manual: number | undefined;
  const needAmount = tg.extractedAmount == null;
  if (needAmount) {
    const v = manualAmountInput.value.trim();
    if (decision === "qualified" && v === "") {
      toast.error(t("home.reviewModal.needAmount"));
      return;
    }
    if (v) {
      const n = Number(v);
      if (Number.isNaN(n) || n < 0) {
        toast.error(t("home.reviewModal.badAmount"));
        return;
      }
      manual = n;
    }
  }
  try {
    await inv.review(tg.id, decision, manual);
    reviewModal.value = false;
    toast.success(
      decision === "qualified"
        ? t("home.reviewModal.qualifiedToast")
        : t("home.reviewModal.unqualifiedToast"),
    );
  } catch (e) {
    toast.error((e as Error).message);
  }
}

// ---------- email report modal ----------
const reportModal = ref(false);
const reportTo = ref("");
const sendingReport = ref(false);
async function sendReport() {
  if (!reportTo.value.trim()) {
    toast.error(t("home.reportModal.needTo"));
    return;
  }
  sendingReport.value = true;
  try {
    const r = await inv.emailReport(reportTo.value.trim());
    if (!r) return;
    toast.success(
      t("home.reportModal.sent", { total: r.total.toFixed(2), count: r.count }),
    );
    reportModal.value = false;
  } catch (e) {
    toast.error(t("home.reportModal.failed") + (e as Error).message);
  } finally {
    sendingReport.value = false;
  }
}

// ---------- init ----------
// Sync the scope default with the active org, then load accessible campaigns.
onMounted(async () => {
  scope.value = activeOrganization.value?.id ?? null;
  void loadCampaigns();
});
// If the user switches their active org on /organizations, reflect it here.
watch(activeOrganization, (o) => {
  scope.value = o?.id ?? null;
});
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- STEP 1 — scope + info -->
    <Card id="step-info">
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <span
            class="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
            >1</span
          >
          {{ t("home.step1.title") }}
        </CardTitle>
        <CardDescription>{{ t("home.step1.desc") }}</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <!-- scope selector: personal vs one of the user's organizations -->
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
            <NuxtLink
              to="/organizations"
              class="inline-flex items-center gap-1 self-center text-xs text-muted-foreground underline"
            >
              <Icon spec="Plus" :size="12" />
              {{ t("home.step1.manageOrgs") }}
            </NuxtLink>
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
        <Button :disabled="creating" @click="createCampaign">
          <Icon spec="ArrowRight" :size="16" />
          {{
            creating
              ? t("home.step1.creating")
              : t("home.step1.create", { scope: orgName(scope) })
          }}
        </Button>

        <!-- resumable campaigns -->
        <div
          v-if="personalCampaigns.length || orgCampaigns.length"
          class="mt-2 flex flex-col gap-3"
        >
          <div class="text-xs font-medium text-muted-foreground">
            {{ t("home.step1.yourCampaigns") }}
          </div>
          <div class="flex flex-col gap-3">
            <div v-if="personalCampaigns.length" class="flex flex-col gap-1.5">
              <div class="text-[11px] uppercase tracking-wide text-muted-foreground">
                {{ t("home.scope.personal") }}
              </div>
              <button
                v-for="c in personalCampaigns"
                :key="c.id"
                type="button"
                class="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-left text-sm hover:bg-accent"
                @click="resumeCampaign(c)"
              >
                <Icon spec="FolderOpen" :size="14" class="text-muted-foreground" />
                <span class="font-medium">{{ c.name || c.expectedTitle }}</span>
                <span class="ml-auto text-xs text-muted-foreground">{{
                  fmtDate(c.createdAt)
                }}</span>
              </button>
            </div>
            <div v-if="orgCampaigns.length" class="flex flex-col gap-1.5">
              <div class="text-[11px] uppercase tracking-wide text-muted-foreground">
                {{ t("home.scope.org") }}
              </div>
              <button
                v-for="c in orgCampaigns"
                :key="c.id"
                type="button"
                class="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-left text-sm hover:bg-accent"
                @click="resumeCampaign(c)"
              >
                <Icon spec="Building2" :size="14" class="text-muted-foreground" />
                <span class="font-medium">{{ c.name || c.expectedTitle }}</span>
                <span class="text-xs text-muted-foreground">·</span>
                <span class="truncate text-xs text-muted-foreground">{{
                  orgName(c.organizationId)
                }}</span>
                <span class="ml-auto text-xs text-muted-foreground">{{
                  fmtDate(c.createdAt)
                }}</span>
              </button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- STEP 2 — upload -->
    <Card v-if="step2" id="step-upload">
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <span
            class="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
            >2</span
          >
          {{ t("home.step2.title") }}
        </CardTitle>
        <CardDescription>{{ t("home.step2.desc") }}</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <button
          type="button"
          class="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors hover:bg-accent/50"
          :class="dragOver ? 'border-primary bg-primary/5' : 'border-border'"
          @click="fileInput?.click()"
          @dragover.prevent="dragOver = true"
          @dragleave.prevent="dragOver = false"
          @drop.prevent="onDrop"
        >
          <Icon spec="FolderUp" :size="28" class="text-muted-foreground" />
          <span class="text-sm font-medium">{{ t("home.step2.drop") }}</span>
          <!-- eslint-disable-next-line vue/no-v-html -- {n} wraps the count in <b>; value is an integer, no injection risk -->
          <span
            class="text-xs text-muted-foreground"
            v-html="
              t('home.step2.selectedFiles', {
                n: `<b>${selectedFiles.length}</b>`,
              })
            "
          ></span>
          <input
            ref="fileInput"
            type="file"
            multiple
            webkitdirectory
            directory
            accept=".pdf,.jpg,.jpeg,.png,.webp,.bmp,.gif,.tif,.tiff"
            class="hidden"
            @change="pickFiles(($event.target as HTMLInputElement).files)"
          />
        </button>
        <div class="flex flex-wrap gap-2">
          <Button
            :disabled="selectedFiles.length === 0 || uploading"
            @click="startUpload"
          >
            <Icon spec="ScanLine" :size="16" />
            {{ uploading ? t("home.step2.uploading") : t("home.step2.start") }}
          </Button>
          <Button variant="ghost" @click="resetUpload">{{
            t("home.step2.reset")
          }}</Button>
        </div>
      </CardContent>
    </Card>

    <!-- STEP 3 — results -->
    <Card v-if="step3" id="step-result">
      <CardHeader class="flex-row items-center justify-between">
        <div>
          <CardTitle class="flex items-center gap-2">
            <span
              class="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
              >3</span
            >
            {{ t("home.step3.title") }}
          </CardTitle>
          <CardDescription>{{
            t("home.step3.subTitleLabel", {
              title: inv.expectedTitle.value,
              tax: inv.expectedTaxId.value || t("common.dash"),
            })
          }}</CardDescription>
        </div>
        <Button variant="outline" size="sm" @click="reportModal = true">
          <Icon spec="Send" :size="14" />
          {{ t("home.step3.sendReport") }}
        </Button>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <!-- summary -->
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="rounded-lg border bg-card p-3">
            <div class="text-xs text-muted-foreground">
              {{ t("home.step3.totalLabel") }}
            </div>
            <div class="text-lg font-bold text-primary">
              ¥{{ inv.totalAmount.value.toFixed(2) }}
            </div>
          </div>
          <div class="rounded-lg border bg-card p-3">
            <div class="text-xs text-muted-foreground">
              {{ t("home.status.qualified") }}
            </div>
            <div class="text-lg font-bold text-emerald-600">
              {{ inv.counts.value.qualified }}
            </div>
          </div>
          <div class="rounded-lg border bg-card p-3">
            <div class="text-xs text-muted-foreground">
              {{ t("home.status.review") }}
            </div>
            <div class="text-lg font-bold text-amber-600">
              {{ inv.counts.value.review }}
            </div>
          </div>
          <div class="rounded-lg border bg-card p-3">
            <div class="text-xs text-muted-foreground">
              {{ t("home.status.unqualified") }}
            </div>
            <div class="text-lg font-bold text-rose-600">
              {{ inv.counts.value.unqualified }}
            </div>
          </div>
        </div>

        <!-- progress -->
        <div
          v-if="inv.hasPending.value"
          class="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <Icon spec="LoaderCircle" :size="14" class="animate-spin" />
          {{
            t("home.step3.progress", {
              done: inv.doneCount.value,
              total: inv.invoices.value.length,
            })
          }}
        </div>

        <!-- filter tabs -->
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="f in FILTERS"
            :key="f.key"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
            :class="
              inv.filter.value === f.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'hover:bg-accent'
            "
            @click="inv.filter.value = f.key"
          >
            {{ t(f.labelKey) }}
            <span class="opacity-70">{{ inv.counts.value[f.key] ?? 0 }}</span>
          </button>
          <div class="relative ml-auto">
            <Icon
              spec="Search"
              :size="14"
              class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              v-model="inv.search.value"
              :placeholder="t('home.step3.searchPlaceholder')"
              class="h-8 w-48 pl-8 text-xs"
            />
          </div>
        </div>

        <!-- table -->
        <div class="overflow-x-auto rounded-lg border">
          <table class="w-full text-sm">
            <thead class="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th class="px-3 py-2 text-left font-medium">
                  {{ t("home.table.filename") }}
                </th>
                <th class="px-3 py-2 text-left font-medium">
                  {{ t("home.table.title") }}
                </th>
                <th class="px-3 py-2 text-left font-medium">
                  {{ t("home.table.taxId") }}
                </th>
                <th class="px-3 py-2 text-right font-medium">
                  {{ t("home.table.amount") }}
                </th>
                <th class="px-3 py-2 text-left font-medium">
                  {{ t("home.table.status") }}
                </th>
                <th class="px-3 py-2 text-left font-medium">
                  {{ t("home.table.reason") }}
                </th>
                <th class="px-3 py-2 text-right font-medium">
                  {{ t("home.table.action") }}
                </th>
              </tr>
            </thead>
            <tbody>
              <template v-if="inv.filtered.value.length">
                <template v-for="i in inv.filtered.value" :key="i.id">
                  <tr
                    class="cursor-pointer border-t hover:bg-accent/40"
                    @click="toggleExpand(i.id)"
                  >
                    <td class="max-w-55 truncate px-3 py-2" :title="i.filename">
                      {{ i.filename }}
                    </td>
                    <td
                      class="max-w-40 truncate px-3 py-2 text-muted-foreground"
                      :title="i.extractedTitle ?? ''"
                    >
                      {{ i.extractedTitle || t("common.dash") }}
                    </td>
                    <td
                      class="px-3 py-2 font-mono text-xs text-muted-foreground"
                    >
                      {{ i.extractedTaxId || t("common.dash") }}
                    </td>
                    <td class="px-3 py-2 text-right tabular-nums">
                      {{ fmtAmount(i) }}
                      <span
                        v-if="isManual(i)"
                        class="text-[10px] text-muted-foreground"
                        >{{ t("home.step3.manualTag") }}</span
                      >
                    </td>
                    <td class="px-3 py-2">
                      <span
                        class="inline-flex rounded px-2 py-0.5 text-xs font-medium"
                        :class="statusCls(i.status)"
                        >{{ statusLabel(i.status) }}</span
                      >
                    </td>
                    <td
                      class="max-w-50 truncate px-3 py-2 text-xs text-muted-foreground"
                      :title="i.reason ?? ''"
                    >
                      {{ i.reason || t("common.dash") }}
                    </td>
                    <td class="px-3 py-2 text-right" @click.stop>
                      <Button
                        v-if="i.status === 'review'"
                        variant="outline"
                        size="sm"
                        @click="openReview(i)"
                        >{{ t("home.action.review") }}</Button
                      >
                      <span
                        v-else-if="i.status === 'error'"
                        class="text-xs text-rose-600"
                        >{{ t("home.action.failed") }}</span
                      >
                      <span v-else class="text-xs text-muted-foreground">{{
                        t("common.dash")
                      }}</span>
                    </td>
                  </tr>
                  <tr v-if="expanded.has(i.id)">
                    <td colspan="7" class="border-t bg-muted/20 p-3">
                      <embed
                        v-if="i.fileType === 'pdf'"
                        :src="`/api/invoice/${i.id}/file`"
                        type="application/pdf"
                        class="h-120 w-full rounded border"
                      />
                      <img
                        v-else
                        :src="`/api/invoice/${i.id}/file`"
                        class="mx-auto max-h-120 rounded border"
                      />
                    </td>
                  </tr>
                </template>
              </template>
              <tr v-else>
                <td
                  colspan="7"
                  class="px-3 py-10 text-center text-sm text-muted-foreground"
                >
                  {{ t("home.step3.empty") }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>

    <!-- manual review modal -->
    <div
      v-if="reviewModal && reviewTarget"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="reviewModal = false"
    >
      <Card class="w-full max-w-md">
        <CardHeader>
          <CardTitle>{{ t("home.reviewModal.title") }}</CardTitle>
          <CardDescription class="truncate">{{
            reviewTarget.filename
          }}</CardDescription>
        </CardHeader>
        <CardContent class="flex flex-col gap-3 text-sm">
          <div>
            <span class="text-muted-foreground">{{
              t("home.reviewModal.titleLabel")
            }}</span
            >{{ reviewTarget.extractedTitle || t("common.none") }}
          </div>
          <div>
            <span class="text-muted-foreground">{{
              t("home.reviewModal.taxLabel")
            }}</span
            ><span class="font-mono text-xs">{{
              reviewTarget.extractedTaxId || t("common.none")
            }}</span>
          </div>
          <div>
            <span class="text-muted-foreground">{{
              t("home.reviewModal.amountLabel")
            }}</span
            >{{
              reviewTarget.extractedAmount != null
                ? "¥" + reviewTarget.extractedAmount.toFixed(2)
                : t("common.none")
            }}
          </div>
          <div
            v-if="reviewTarget.extractedAmount == null"
            class="flex flex-col gap-1.5"
          >
            <Label
              >{{ t("home.reviewModal.manualAmountLabel")
              }}<span class="text-rose-600">{{
                t("home.reviewModal.manualAmountHint")
              }}</span></Label
            >
            <Input
              v-model="manualAmountInput"
              type="number"
              step="0.01"
              :placeholder="t('home.reviewModal.manualAmountPlaceholder')"
            />
          </div>
          <p class="text-xs text-muted-foreground">
            {{ t("home.reviewModal.hint") }}
          </p>
        </CardContent>
        <CardFooter class="justify-end gap-2">
          <Button variant="ghost" @click="reviewModal = false">{{
            t("common.cancel")
          }}</Button>
          <Button variant="destructive" @click="submitReview('unqualified')">{{
            t("home.reviewModal.unqualify")
          }}</Button>
          <Button @click="submitReview('qualified')">{{
            t("home.reviewModal.qualify")
          }}</Button>
        </CardFooter>
      </Card>
    </div>

    <!-- email report modal -->
    <div
      v-if="reportModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="reportModal = false"
    >
      <Card class="w-full max-w-md">
        <CardHeader>
          <CardTitle>{{ t("home.reportModal.title") }}</CardTitle>
          <CardDescription>{{ t("home.reportModal.desc") }}</CardDescription>
        </CardHeader>
        <CardContent class="flex flex-col gap-2">
          <Label>{{ t("home.reportModal.toLabel") }}</Label>
          <Input
            v-model="reportTo"
            type="email"
            placeholder="finance@example.com"
          />
          <i18n-t
            keypath="home.reportModal.needMailConfig"
            tag="p"
            class="text-xs text-muted-foreground"
          >
            <template #link>
              <NuxtLink to="/settings" class="underline">{{
                t("home.reportModal.mailSettingsLink")
              }}</NuxtLink>
            </template>
          </i18n-t>
        </CardContent>
        <CardFooter class="justify-end gap-2">
          <Button
            variant="ghost"
            :disabled="sendingReport"
            @click="reportModal = false"
            >{{ t("common.cancel") }}</Button
          >
          <Button :disabled="sendingReport" @click="sendReport">
            <Icon spec="Send" :size="14" />
            {{
              sendingReport
                ? t("home.reportModal.sending")
                : t("home.reportModal.send")
            }}
          </Button>
        </CardFooter>
      </Card>
    </div>
  </div>
</template>
