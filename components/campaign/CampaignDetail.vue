<script setup lang="ts">
import type { InvoicePublic } from "#shared/types";

// GitHub repo-style campaign page: breadcrumb header (org / campaign) with
// visibility + status badges and the export/report actions, then tabs —
// Invoices (upload + results + submit/review flow), Settings (visibility /
// status / collaborators / transfer, manager-only), Audit (privileged).
// All logic is reused from useInvoice(); this is the old home-page 3-step
// flow, restructured.
const props = defineProps<{
  campaignId: number;
  orgSlug: string | null;
}>();

const { t } = useI18n();
const route = useRoute();
const inv = useInvoice();
const { user } = useAuth();
const { organizations, refresh: refreshOrgs } = useOrgs();

const loading = ref(true);
const notFound = ref(false);
const tab = ref<"invoices" | "settings" | "audit">(
  (route.query.tab as string) === "settings"
    ? "settings"
    : (route.query.tab as string) === "audit"
      ? "audit"
      : "invoices",
);

const orgName = computed(
  () =>
    organizations.value.find((o) => o.slug === props.orgSlug)?.name ??
    props.orgSlug,
);

onMounted(async () => {
  void refreshOrgs();
  loading.value = true;
  try {
    await inv.resume(props.campaignId);
    myGroupIds.value = inv.myGroupIds.value;
  } catch {
    notFound.value = true;
    myGroupIds.value = inv.myGroupIds.value;
  } finally {
    loading.value = false;
  }
  void loadGroups();
});
onUnmounted(() => inv.stopPolling());

// ---------- upload ----------
const selectedFiles = ref<File[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);
const dragOver = ref(false);
const uploading = ref(false);

function pickFiles(list: FileList | null) {
  if (!list) return;
  selectedFiles.value = Array.from(list).filter((f) =>
    /\.(pdf|jpe?g|png|webp|bmp|gif|tiff?|xml|ofd)$/i.test(f.name),
  );
}
function onDrop(e: DragEvent) {
  dragOver.value = false;
  pickFiles(e.dataTransfer?.files ?? null);
}
async function startUpload() {
  if (selectedFiles.value.length === 0) return;
  uploading.value = true;
  try {
    await inv.upload(selectedFiles.value);
    selectedFiles.value = [];
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
}

// ---------- groups ----------
interface GroupInfo {
  id: number;
  name: string;
  reviewers: { userId: string; name: string; email: string }[];
}
const groups = ref<GroupInfo[]>([]);
const myGroupIds = ref<number[]>([]);
const groupNameInput = ref("");
const groupBusy = ref(false);
const groupReviewerEmail = ref<Record<number, string>>({});

async function loadGroups() {
  try {
    const data = await $fetch<{ groups: GroupInfo[] }>(
      `/api/campaigns/${props.campaignId}/groups`,
    );
    groups.value = data.groups;
  } catch {
    groups.value = [];
  }
}
const groupName = (gid: number | null): string | null =>
  gid == null ? null : (groups.value.find((g) => g.id === gid)?.name ?? null);

async function createGroup() {
  const n = groupNameInput.value.trim();
  if (!n) return;
  groupBusy.value = true;
  try {
    await $fetch(`/api/campaigns/${props.campaignId}/groups`, {
      method: "POST",
      body: { name: n },
    });
    groupNameInput.value = "";
    await loadGroups();
  } catch (e) {
    toast.error((e as Error).message);
  } finally {
    groupBusy.value = false;
  }
}
async function deleteGroup(id: number) {
  try {
    await $fetch(`/api/campaigns/${props.campaignId}/groups/${id}`, {
      method: "DELETE",
    });
    await loadGroups();
    await inv.refresh();
  } catch (e) {
    toast.error((e as Error).message);
  }
}
async function addGroupReviewer(gid: number) {
  const email = (groupReviewerEmail.value[gid] ?? "").trim();
  if (!email) return;
  try {
    await $fetch(`/api/campaigns/${props.campaignId}/groups/${gid}/reviewers`, {
      method: "POST",
      body: { email },
    });
    groupReviewerEmail.value[gid] = "";
    await loadGroups();
    toast.success(t("home.groups.reviewerAdded"));
  } catch (e) {
    toast.error((e as Error).message);
  }
}
async function removeGroupReviewer(gid: number, userId: string) {
  try {
    await $fetch(
      `/api/campaigns/${props.campaignId}/groups/${gid}/reviewers/${userId}`,
      { method: "DELETE" },
    );
    await loadGroups();
  } catch (e) {
    toast.error((e as Error).message);
  }
}
async function setInvoiceGroup(iid: number, gid: number | null) {
  try {
    await $fetch(`/api/campaigns/${props.campaignId}/invoices/group`, {
      method: "POST",
      body: { invoiceIds: [iid], groupId: gid },
    });
    await inv.refresh();
  } catch (e) {
    toast.error((e as Error).message);
  }
}

// ---------- results ----------
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

// ---------- submit/approve flow ----------
const TERMINAL = new Set(["qualified", "review", "unqualified"]);
const submitFlow = computed(() => inv.flow.value === "submit");
const canReview = computed(() => !!inv.rights.value?.canReview);
const canExport = computed(
  () => !!inv.rights.value?.canExport || !!inv.rights.value?.legacy,
);
const canManage = computed(() => !!inv.rights.value?.canManage);
const canUpload = computed(() => !!inv.rights.value?.canUpload);

const RSTATE_CLS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
};
function rstateCls(s: string): string {
  return RSTATE_CLS[s] ?? "bg-muted text-muted-foreground";
}
function rstateLabel(s: string): string {
  switch (s) {
    case "draft":
      return t("home.reviewState.draft");
    case "submitted":
      return t("home.reviewState.submitted");
    case "approved":
      return t("home.reviewState.approved");
    default:
      return t("home.reviewState.rejected");
  }
}
function isMine(i: InvoicePublic): boolean {
  return inv.scopedToMe.value || i.uploaderId === user.value?.id;
}
function submittable(i: InvoicePublic): boolean {
  return (
    submitFlow.value &&
    isMine(i) &&
    i.reviewState === "draft" &&
    TERMINAL.has(i.status)
  );
}
const isGroupReviewer = computed(() => !!inv.rights.value?.groupReviewer);
function inMyGroup(i: InvoicePublic): boolean {
  return i.groupId != null && myGroupIds.value.includes(i.groupId);
}
function reviewable(i: InvoicePublic): boolean {
  const mayReview = canReview.value || (isGroupReviewer.value && inMyGroup(i));
  if (!mayReview) return false;
  if (submitFlow.value) return i.reviewState === "submitted";
  return i.status === "review";
}
const submittableCount = computed(
  () => inv.invoices.value.filter(submittable).length,
);
async function doSubmit(i: InvoicePublic) {
  try {
    await inv.submitInvoice(i.id);
    toast.success(t("home.action.submittedToast"));
  } catch (e) {
    toast.error((e as Error).message);
  }
}
async function doSubmitAll() {
  try {
    const n = await inv.submitAll();
    toast.success(t("home.action.submittedAllToast", { n }));
  } catch (e) {
    toast.error((e as Error).message);
  }
}

// ---------- review modal ----------
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
  if (tg.extractedAmount == null) {
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

// ---------- export ----------
const exportOpen = ref(false);
function doExport(fmt: "csv" | "xlsx" | "zip") {
  exportOpen.value = false;
  window.open(
    `/api/campaigns/${props.campaignId}/export?format=${fmt}`,
    "_blank",
  );
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

// ---------- settings tab ----------
const setSection = ref<"general" | "groups" | "collab" | "transfer">("general");
const setVisibility = ref<"public" | "internal" | "private">("internal");
const setSearchable = ref(false);
const setStatus = ref<"active" | "closed" | "archived">("active");
const setSaving = ref(false);
const collaborators = ref<{ userId: string; name: string; email: string }[]>(
  [],
);
const collabEmail = ref("");
const collabBusy = ref(false);
const transferOrgId = ref("");
const transferBusy = ref(false);
const otherOrgs = computed(() =>
  organizations.value.filter((o) => o.id !== inv.organizationId.value),
);

async function loadSettings() {
  try {
    const data = await $fetch<{
      visibility: "public" | "internal" | "private";
      status: "active" | "closed" | "archived";
      searchable?: boolean;
    }>(`/api/campaigns/${props.campaignId}`);
    setVisibility.value = data.visibility;
    setStatus.value = data.status;
    setSearchable.value = !!data.searchable;
  } catch {
    // keep defaults
  }
  sdOrig.value = sdSnapshot();
  try {
    const data = await $fetch<{ collaborators: typeof collaborators.value }>(
      `/api/campaigns/${props.campaignId}/collaborators`,
    );
    collaborators.value = data.collaborators;
  } catch {
    collaborators.value = [];
  }
}
// ---------- settings general: unsaved-changes machinery ----------
/** Baseline of the staged general form (server state at last load/save). */
const sdOrig = ref<{ v: string; s: string; q: boolean } | null>(null);
function sdSnapshot() {
  return {
    v: setVisibility.value,
    s: setStatus.value,
    q: setSearchable.value,
  };
}
const sdDirty = computed(
  () =>
    !!sdOrig.value &&
    JSON.stringify(sdSnapshot()) !== JSON.stringify(sdOrig.value),
);
const sdSavedFlash = ref(false);
function discardSettings() {
  if (!sdOrig.value) return;
  setVisibility.value = sdOrig.value.v as typeof setVisibility.value;
  setStatus.value = sdOrig.value.s as typeof setStatus.value;
  setSearchable.value = sdOrig.value.q;
}
const { confirmLeave: sdConfirmLeave, proceed: sdProceed } =
  useUnsavedLeaveGuard(sdDirty, setSaving);
// Leaving the settings TAB is not a route change (tabs are component state),
// so the router guard can't cover it — intercept tab / sub-section clicks the
// same way and route them through the same dialog.
const confirmTabLeave = ref(false);
const pendingLeave = ref<
  | { kind: "tab"; key: "invoices" | "settings" | "audit" }
  | {
      kind: "setSection";
      key: "general" | "groups" | "collab" | "transfer";
    }
  | null
>(null);
function leaveBlocked(): boolean {
  if (tab.value !== "settings" || !sdDirty.value || setSaving.value)
    return false;
  confirmTabLeave.value = true;
  return true;
}
function switchTab(key: "invoices" | "settings" | "audit") {
  if (key === tab.value) return;
  const stash = pendingLeave.value;
  pendingLeave.value = { kind: "tab", key };
  if (leaveBlocked()) return;
  pendingLeave.value = stash;
  tab.value = key;
}
function switchSetSection(key: "general" | "groups" | "collab" | "transfer") {
  if (key === setSection.value) return;
  if (setSection.value !== "general") {
    setSection.value = key; // staging lives only on general — nothing dirty
    return;
  }
  const stash = pendingLeave.value;
  pendingLeave.value = { kind: "setSection", key };
  if (leaveBlocked()) return;
  pendingLeave.value = stash;
  setSection.value = key;
}
function performPendingLeave() {
  const p = pendingLeave.value;
  pendingLeave.value = null;
  confirmTabLeave.value = false;
  if (p?.kind === "tab") tab.value = p.key;
  else if (p?.kind === "setSection") setSection.value = p.key;
  else sdProceed();
}
async function onLeaveDialogSave() {
  await saveSettings();
  if (sdDirty.value) return; // save failed — stay put
  performPendingLeave();
}

async function saveSettings() {
  setSaving.value = true;
  try {
    await $fetch(`/api/campaigns/${props.campaignId}`, {
      method: "PUT",
      body: {
        visibility: setVisibility.value,
        searchable: setVisibility.value === "public" && setSearchable.value,
        status: setStatus.value,
      },
    });
    sdOrig.value = sdSnapshot();
    sdSavedFlash.value = true;
    setTimeout(() => (sdSavedFlash.value = false), 2000);
    toast.success(t("campaign.settingsSaved"));
    await inv.refresh();
  } catch (e) {
    toast.error((e as Error).message);
  } finally {
    setSaving.value = false;
  }
}
async function addCollaborator() {
  if (!collabEmail.value.trim()) return;
  collabBusy.value = true;
  try {
    await $fetch(`/api/campaigns/${props.campaignId}/collaborators`, {
      method: "POST",
      body: { email: collabEmail.value.trim() },
    });
    collabEmail.value = "";
    toast.success(t("home.collab.added"));
    await loadSettings();
  } catch (e) {
    toast.error((e as Error).message);
  } finally {
    collabBusy.value = false;
  }
}
async function removeCollaborator(userId: string) {
  try {
    await $fetch(`/api/campaigns/${props.campaignId}/collaborators/${userId}`, {
      method: "DELETE",
    });
    await loadSettings();
  } catch (e) {
    toast.error((e as Error).message);
  }
}
async function initiateTransfer() {
  if (!transferOrgId.value) return;
  transferBusy.value = true;
  try {
    await $fetch(`/api/campaigns/${props.campaignId}/transfer`, {
      method: "POST",
      body: { target_org_id: transferOrgId.value },
    });
    toast.success(t("home.transfer.sent"));
    transferOrgId.value = "";
  } catch (e) {
    toast.error((e as Error).message);
  } finally {
    transferBusy.value = false;
  }
}
watch(tab, (v) => {
  if (v === "settings" && !collaborators.value.length) void loadSettings();
  if (v === "audit") void loadAudit();
});

// ---------- audit tab ----------
const auditLogs = ref<
  {
    id: number;
    action: string;
    target: string;
    actorName: string;
    createdAt: string;
  }[]
>([]);
const auditLoading = ref(false);
async function loadAudit() {
  auditLoading.value = true;
  try {
    const data = await $fetch<{ logs: typeof auditLogs.value }>("/api/audit", {
      query: { campaignId: props.campaignId },
    });
    auditLogs.value = data.logs;
  } catch {
    auditLogs.value = [];
  } finally {
    auditLoading.value = false;
  }
}
</script>

<template>
  <div v-if="notFound" class="py-16 text-center text-sm text-muted-foreground">
    {{ t("campaign.notFound") }}
    <NuxtLink to="/" class="ml-1 underline">{{ t("settings.back") }}</NuxtLink>
  </div>
  <div
    v-else-if="loading"
    class="py-16 text-center text-sm text-muted-foreground"
  >
    {{ t("settings.loading") }}
  </div>
  <div v-else class="flex flex-col gap-6">
    <!-- repo-style header -->
    <div class="border-b pb-4">
      <div class="flex flex-wrap items-start gap-3">
        <Icon
          spec="FolderOpen"
          :size="20"
          class="mt-1 shrink-0 text-muted-foreground"
        />
        <div class="min-w-0 flex-1">
          <nav
            class="flex flex-wrap items-center gap-1 text-lg"
            aria-label="breadcrumb"
          >
            <NuxtLink
              v-if="orgSlug"
              :to="`/orgs/${orgSlug}`"
              class="font-semibold hover:text-primary"
              >{{ orgName }}</NuxtLink
            >
            <span v-if="orgSlug" class="text-muted-foreground">/</span>
            <h1 class="truncate font-semibold">{{ inv.name.value }}</h1>
          </nav>
          <div class="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            <span
              class="rounded-full border px-2 py-0.5 text-muted-foreground"
              >{{ t(`home.settings.vis.${inv.visibility.value}`) }}</span
            >
            <span
              class="rounded-full border px-2 py-0.5 text-muted-foreground"
              >{{ t(`home.settings.st.${inv.status.value}`) }}</span
            >
            <span
              v-if="inv.rights.value?.legacy"
              class="rounded-full border border-amber-500/40 px-2 py-0.5 text-amber-700 dark:text-amber-400"
              >{{ t("orgs.migration.badge") }}</span
            >
            <span class="text-muted-foreground">
              {{
                t("home.step3.subTitleLabel", {
                  title: inv.expectedTitle.value,
                  tax: inv.expectedTaxId.value || t("common.dash"),
                })
              }}
            </span>
          </div>
        </div>
        <div class="flex shrink-0 gap-2">
          <div v-if="canExport" class="relative">
            <div
              v-if="exportOpen"
              class="fixed inset-0 z-10"
              @click="exportOpen = false"
            />
            <Button
              variant="outline"
              size="sm"
              @click="exportOpen = !exportOpen"
            >
              <Icon spec="Download" :size="14" />
              {{ t("home.export.button") }}
              <Icon spec="ChevronDown" :size="12" />
            </Button>
            <div
              v-if="exportOpen"
              class="absolute right-0 z-20 mt-1 flex w-36 flex-col overflow-hidden rounded-md border bg-popover shadow-md"
            >
              <button
                v-for="f in ['csv', 'xlsx', 'zip'] as const"
                :key="f"
                type="button"
                class="px-3 py-2 text-left text-xs hover:bg-accent"
                @click="doExport(f)"
              >
                {{ t(`home.export.${f}`) }}
              </button>
            </div>
          </div>
          <Button
            v-if="canExport"
            variant="outline"
            size="sm"
            @click="reportModal = true"
          >
            <Icon spec="Send" :size="14" />
            {{ t("home.step3.sendReport") }}
          </Button>
        </div>
      </div>

      <!-- tabs -->
      <nav class="mt-3 flex gap-1">
        <button
          v-for="tb in [
            { key: 'invoices', label: t('campaign.tabs.invoices') },
            ...(canManage
              ? [{ key: 'settings', label: t('campaign.tabs.settings') }]
              : []),
            ...(canReview || canManage
              ? [{ key: 'audit', label: t('campaign.tabs.audit') }]
              : []),
          ]"
          :key="tb.key"
          type="button"
          class="rounded-t-md px-3 py-2 text-sm transition-colors"
          :class="
            tab === tb.key
              ? 'border-t-2 border-primary font-medium text-foreground'
              : 'border-t-2 border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground'
          "
          @click="switchTab(tb.key as typeof tab)"
        >
          {{ tb.label }}
        </button>
      </nav>
    </div>

    <!-- ============ invoices tab ============ -->
    <div v-if="tab === 'invoices'" class="flex flex-col gap-4">
      <!-- upload dropzone -->
      <button
        v-if="canUpload"
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
          accept=".pdf,.jpg,.jpeg,.png,.webp,.bmp,.gif,.tif,.tiff,.xml,.ofd"
          class="hidden"
          @change="pickFiles(($event.target as HTMLInputElement).files)"
        />
      </button>
      <div v-if="canUpload" class="flex flex-wrap gap-2">
        <Button
          :disabled="selectedFiles.length === 0 || uploading"
          @click="startUpload"
        >
          <Icon spec="ScanLine" :size="16" />
          {{ uploading ? t("home.step2.uploading") : t("home.step2.start") }}
        </Button>
        <Button
          v-if="submitFlow && submittableCount > 0"
          variant="outline"
          @click="doSubmitAll"
        >
          <Icon spec="Send" :size="14" />
          {{ t("home.action.submitAll") }} ({{ submittableCount }})
        </Button>
        <Button variant="ghost" @click="resetUpload">{{
          t("home.step2.reset")
        }}</Button>
      </div>

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

      <!-- filters + search -->
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
                    <span
                      v-if="i.kind === 'receipt'"
                      class="mr-1 rounded-full border border-sky-500/40 px-2 py-0.5 text-[11px] text-sky-700 dark:text-sky-400"
                      >{{ t("home.kind.receipt") }}</span
                    >{{ i.filename }}
                    <select
                      v-if="canManage && groups.length"
                      class="ml-1 rounded border bg-background px-1 py-0.5 text-[11px]"
                      :value="i.groupId ?? ''"
                      @change.stop="
                        setInvoiceGroup(
                          i.id,
                          ($event.target as HTMLSelectElement).value
                            ? Number(($event.target as HTMLSelectElement).value)
                            : null,
                        )
                      "
                      @click.stop
                    >
                      <option value="">
                        {{ t("home.groups.ungrouped") }}
                      </option>
                      <option v-for="g in groups" :key="g.id" :value="g.id">
                        {{ g.name }}
                      </option>
                    </select>
                    <span
                      v-else-if="groupName(i.groupId)"
                      class="ml-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
                      >{{ groupName(i.groupId) }}</span
                    >
                  </td>
                  <td
                    class="max-w-40 truncate px-3 py-2 text-muted-foreground"
                    :title="
                      i.kind === 'receipt'
                        ? (i.extractedMerchant ?? '')
                        : (i.extractedTitle ?? '')
                    "
                  >
                    {{
                      i.kind === "receipt"
                        ? i.extractedMerchant || t("common.dash")
                        : i.extractedTitle || t("common.dash")
                    }}
                  </td>
                  <td class="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {{
                      i.kind === "receipt"
                        ? i.extractedOrderNo || t("common.dash")
                        : i.extractedTaxId || t("common.dash")
                    }}
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
                    <span
                      v-if="submitFlow"
                      class="ml-1 inline-flex rounded px-2 py-0.5 text-xs font-medium"
                      :class="rstateCls(i.reviewState)"
                      >{{ rstateLabel(i.reviewState) }}</span
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
                      v-if="submittable(i)"
                      variant="outline"
                      size="sm"
                      @click="doSubmit(i)"
                    >
                      {{ t("home.action.submit") }}
                    </Button>
                    <Button
                      v-else-if="reviewable(i)"
                      variant="outline"
                      size="sm"
                      @click="openReview(i)"
                    >
                      {{ t("home.action.review") }}
                    </Button>
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
                      v-else-if="i.fileType === 'image'"
                      :src="`/api/invoice/${i.id}/file`"
                      class="mx-auto max-h-120 rounded border"
                    />
                    <!-- 数电票 structured files: no visual render — link the parsed source -->
                    <div
                      v-else
                      class="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground"
                    >
                      <Icon
                        spec="FileText"
                        :size="24"
                        class="text-muted-foreground"
                      />
                      <span>{{ t("campaign.einvoice") }}</span>
                      <a
                        :href="`/api/invoice/${i.id}/text`"
                        target="_blank"
                        class="underline underline-offset-2 hover:text-foreground"
                        >{{ t("campaign.viewSource") }}</a
                      >
                    </div>
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
    </div>

    <!-- ============ settings tab (sectioned, GitHub-style) ============ -->
    <div
      v-else-if="tab === 'settings' && canManage"
      class="flex flex-col gap-6 lg:flex-row lg:gap-10"
    >
      <aside class="w-full shrink-0 lg:w-40">
        <nav class="flex flex-col gap-0.5">
          <button
            v-for="ss in [
              { key: 'general', label: t('orgs.settings.general') },
              { key: 'groups', label: t('home.groups.title') },
              { key: 'collab', label: t('home.collab.title') },
              { key: 'transfer', label: t('home.transfer.title') },
            ]"
            :key="ss.key"
            type="button"
            class="rounded-md px-2 py-1.5 text-left text-sm transition-colors"
            :class="
              setSection === ss.key
                ? 'bg-accent font-medium text-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            "
            @click="switchSetSection(ss.key)"
          >
            {{ ss.label }}
          </button>
        </nav>
      </aside>

      <!-- fixed overlays: present for the whole settings tab, not just the
           general sub-section -->
      <SettingsSaveBar
        :dirty="sdDirty"
        :saving="setSaving"
        :saved="sdSavedFlash"
        @save="saveSettings"
        @discard="discardSettings"
      />
      <UnsavedLeaveDialog
        :open="sdConfirmLeave || confirmTabLeave"
        :saving="setSaving"
        @stay="
          () => {
            sdConfirmLeave = false;
            confirmTabLeave = false;
          }
        "
        @discard="(discardSettings(), performPendingLeave())"
        @save="onLeaveDialogSave"
      />

      <div
        v-if="setSection === 'general'"
        class="flex min-w-0 max-w-2xl flex-1 flex-col gap-6"
      >
        <div class="flex flex-col gap-1.5">
          <Label>{{ t("home.settings.visibility") }}</Label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="v in ['public', 'internal', 'private'] as const"
              :key="v"
              type="button"
              class="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
              :class="
                setVisibility === v
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'hover:bg-accent'
              "
              @click="setVisibility = v"
            >
              {{ t(`home.settings.vis.${v}`) }}
            </button>
          </div>
          <p class="text-xs text-muted-foreground">
            {{ t(`home.settings.visDesc.${setVisibility}`) }}
          </p>
        </div>
        <label
          v-if="setVisibility === 'public'"
          class="flex items-center gap-2 text-sm"
        >
          <input
            v-model="setSearchable"
            type="checkbox"
            class="size-4 accent-(--color-primary)"
          />
          {{ t("home.settings.searchable") }}
        </label>
        <div class="flex flex-col gap-1.5">
          <Label>{{ t("home.settings.status") }}</Label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="s in ['active', 'closed', 'archived'] as const"
              :key="s"
              type="button"
              class="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
              :class="
                setStatus === s
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'hover:bg-accent'
              "
              @click="setStatus = s"
            >
              {{ t(`home.settings.st.${s}`) }}
            </button>
          </div>
          <p class="text-xs text-muted-foreground">
            {{ t(`home.settings.stDesc.${setStatus}`) }}
          </p>
        </div>
        <!-- Save affordance: sticky SettingsSaveBar appears when the staged
             form differs from the server state. -->
      </div>

      <!-- groups & reviewers -->
      <div
        v-else-if="setSection === 'groups'"
        class="flex min-w-0 max-w-2xl flex-1 flex-col gap-3"
      >
        <h3 class="text-base font-semibold">{{ t("home.groups.title") }}</h3>
        <p class="text-sm text-muted-foreground">{{ t("home.groups.desc") }}</p>
        <div
          v-for="g in groups"
          :key="g.id"
          class="flex flex-col gap-2 rounded-lg border p-3"
        >
          <div class="flex items-center gap-2">
            <Icon spec="FolderGit2" :size="15" class="text-muted-foreground" />
            <span class="text-sm font-medium">{{ g.name }}</span>
            <Button
              variant="ghost"
              size="sm"
              class="ml-auto"
              @click="deleteGroup(g.id)"
            >
              {{ t("orgs.remove") }}
            </Button>
          </div>
          <div
            v-for="r in g.reviewers"
            :key="r.userId"
            class="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            <Icon spec="UserCheck" :size="14" class="text-muted-foreground" />
            <span class="font-medium">{{ r.name }}</span>
            <span class="text-xs text-muted-foreground">{{ r.email }}</span>
            <Button
              variant="ghost"
              size="sm"
              class="ml-auto"
              @click="removeGroupReviewer(g.id, r.userId)"
            >
              {{ t("orgs.remove") }}
            </Button>
          </div>
          <form class="flex gap-2" @submit.prevent="addGroupReviewer(g.id)">
            <Input
              v-model="groupReviewerEmail[g.id]"
              type="email"
              :placeholder="t('home.groups.reviewerPlaceholder')"
              class="flex-1"
            />
            <Button type="submit" variant="outline" size="sm">
              {{ t("home.groups.addReviewer") }}
            </Button>
          </form>
        </div>
        <p v-if="!groups.length" class="text-xs text-muted-foreground">
          {{ t("home.groups.none") }}
        </p>
        <form class="flex gap-2" @submit.prevent="createGroup">
          <Input
            v-model="groupNameInput"
            :placeholder="t('home.groups.namePlaceholder')"
            class="w-48"
          />
          <Button type="submit" variant="outline" :disabled="groupBusy">
            {{ t("home.groups.create") }}
          </Button>
        </form>
      </div>

      <!-- collaborators -->
      <div
        v-else-if="setSection === 'collab'"
        class="flex min-w-0 max-w-2xl flex-1 flex-col gap-2"
      >
        <h3 class="text-sm font-medium">{{ t("home.collab.title") }}</h3>
        <div
          v-for="c in collaborators"
          :key="c.userId"
          class="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
        >
          <div class="min-w-0 flex-1">
            <div class="truncate font-medium">{{ c.name }}</div>
            <div class="truncate text-xs text-muted-foreground">
              {{ c.email }}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            @click="removeCollaborator(c.userId)"
          >
            {{ t("home.collab.remove") }}
          </Button>
        </div>
        <p v-if="!collaborators.length" class="text-xs text-muted-foreground">
          {{ t("home.collab.none") }}
        </p>
        <form class="flex gap-2" @submit.prevent="addCollaborator">
          <Input
            v-model="collabEmail"
            type="email"
            :placeholder="t('home.collab.emailPlaceholder')"
            class="flex-1"
          />
          <Button type="submit" variant="outline" :disabled="collabBusy">
            {{ t("home.collab.add") }}
          </Button>
        </form>
      </div>

      <!-- transfer -->
      <div
        v-else-if="setSection === 'transfer' && inv.organizationId.value"
        class="flex min-w-0 max-w-2xl flex-1 flex-col gap-2"
      >
        <h3 class="text-sm font-medium">{{ t("home.transfer.title") }}</h3>
        <form
          v-if="otherOrgs.length"
          class="flex gap-2"
          @submit.prevent="initiateTransfer"
        >
          <select
            v-model="transferOrgId"
            class="h-9 flex-1 rounded-md border bg-background px-3 text-sm"
          >
            <option value="" disabled>{{ t("home.transfer.pick") }}</option>
            <option v-for="o in otherOrgs" :key="o.id" :value="o.id">
              {{ o.name }}
            </option>
          </select>
          <Button
            type="submit"
            variant="outline"
            :disabled="transferBusy || !transferOrgId"
          >
            {{ t("home.transfer.send") }}
          </Button>
        </form>
        <p v-else class="text-sm text-muted-foreground">
          {{ t("home.transfer.noTarget") }}
        </p>
        <p class="text-xs text-muted-foreground">
          {{ t("home.transfer.desc") }}
        </p>
      </div>
      <div v-else-if="setSection === 'transfer'" class="flex-1">
        <p class="text-sm text-muted-foreground">
          {{ t("home.transfer.personalNone") }}
        </p>
      </div>
    </div>

    <!-- ============ audit tab ============ -->
    <div v-else-if="tab === 'audit'" class="flex flex-col gap-1">
      <div
        v-if="auditLoading"
        class="py-8 text-center text-sm text-muted-foreground"
      >
        {{ t("settings.loading") }}
      </div>
      <div
        v-for="l in auditLogs"
        :key="l.id"
        class="flex flex-wrap items-baseline gap-x-2 border-b py-2 text-xs"
      >
        <span class="w-36 shrink-0 text-muted-foreground">{{
          new Date(l.createdAt).toLocaleString()
        }}</span>
        <span class="font-mono font-medium">{{ l.action }}</span>
        <span v-if="l.target" class="text-muted-foreground"
          >· {{ l.target }}</span
        >
        <span class="ml-auto text-muted-foreground">{{ l.actorName }}</span>
      </div>
      <p
        v-if="!auditLoading && !auditLogs.length"
        class="py-8 text-center text-sm text-muted-foreground"
      >
        {{ t("orgs.audit.empty") }}
      </p>
    </div>

    <!-- review modal -->
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
            }}</span>
            {{ reviewTarget.extractedTitle || t("common.none") }}
          </div>
          <div>
            <span class="text-muted-foreground">{{
              t("home.reviewModal.taxLabel")
            }}</span>
            <span class="font-mono text-xs">{{
              reviewTarget.extractedTaxId || t("common.none")
            }}</span>
          </div>
          <div>
            <span class="text-muted-foreground">{{
              t("home.reviewModal.amountLabel")
            }}</span>
            {{
              reviewTarget.extractedAmount != null
                ? "¥" + reviewTarget.extractedAmount.toFixed(2)
                : t("common.none")
            }}
          </div>
          <div
            v-if="reviewTarget.extractedAmount == null"
            class="flex flex-col gap-1.5"
          >
            <Label>
              {{ t("home.reviewModal.manualAmountLabel") }}
              <span class="text-rose-600">{{
                t("home.reviewModal.manualAmountHint")
              }}</span>
            </Label>
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
          <Button variant="destructive" @click="submitReview('unqualified')">
            {{
              submitFlow
                ? t("home.reviewModal.reject")
                : t("home.reviewModal.unqualify")
            }}
          </Button>
          <Button @click="submitReview('qualified')">
            {{
              submitFlow
                ? t("home.reviewModal.approve")
                : t("home.reviewModal.qualify")
            }}
          </Button>
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
          >
            {{ t("common.cancel") }}
          </Button>
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
