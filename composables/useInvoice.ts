import type {
  CampaignPublic,
  CampaignRights,
  CampaignStatus,
  CampaignVisibility,
  InvoicePublic,
  InvoiceStatus,
} from "#shared/types";

export interface MailConfigClient {
  smtpServer: string;
  smtpPort: number;
  useSsl: boolean;
  useTls: boolean;
  usePassword: boolean;
  senderEmail: string;
  senderEmailDisplay: string;
  senderDomain: string;
  hasPassword: boolean;
  maxLenRecipientEmail: number;
  maxLenSubject: number;
  maxLenBody: number;
  provider: string;
  postUrl: string;
  postSchema: string;
  postFieldMap: string;
  postSchemas: string;
  hasPostAuthToken: boolean;
}

export type FilterKey = "all" | InvoiceStatus;

/** Options when starting a new campaign. */
export interface CreateCampaignOptions {
  organizationId?: string | null;
  name?: string;
  /** Stored invoice-title ids to allow (multi); see /api/titles. */
  titleIds?: number[];
}

/**
 * Reactive state + API calls for a single active reimbursement campaign. One
 * campaign = the buyer title + tax id to match against, plus its uploaded
 * invoices. The campaign may be personal (`organizationId` null) or org-scoped.
 */
export function useInvoice() {
  const campaignId = ref<number | null>(null);
  const organizationId = ref<string | null>(null);
  const name = ref("");
  const expectedTitle = ref("");
  const expectedTaxId = ref("");
  const invoices = ref<InvoicePublic[]>([]);
  const totalAmount = ref(0);
  const hasPending = ref(false);
  /** Server-computed rights + review flow + scoping for the active campaign. */
  const rights = ref<CampaignRights | null>(null);
  /** Group ids the caller reviews (org role "reviewer"). */
  const myGroupIds = ref<number[]>([]);
  const flow = ref<"direct" | "submit">("direct");
  const scopedToMe = ref(false);
  const visibility = ref<CampaignVisibility>("internal");
  const status = ref<CampaignStatus>("active");
  const filter = ref<FilterKey>("all");
  const search = ref("");
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  /** Create a new campaign under the current scope (personal or active org). Returns its id. */
  async function createCampaign(
    title: string,
    taxId: string,
    opts: CreateCampaignOptions = {},
  ): Promise<number> {
    const data = await $fetch<{
      ok: boolean;
      campaign_id: number;
      msg?: string;
    }>("/api/campaign", {
      method: "POST",
      body: {
        title,
        tax_id: taxId,
        organization_id: opts.organizationId ?? null,
        name: opts.name ?? "",
        title_ids: opts.titleIds ?? [],
      },
    });
    if (!data.ok) throw new Error(data.msg || "创建征集活动失败");
    campaignId.value = data.campaign_id;
    organizationId.value = opts.organizationId ?? null;
    name.value = opts.name?.trim() || title;
    expectedTitle.value = title;
    expectedTaxId.value = taxId;
    invoices.value = [];
    totalAmount.value = 0;
    hasPending.value = false;
    return data.campaign_id;
  }

  /** Resume an existing campaign by id (loads its header + invoices). */
  async function resume(id: number) {
    const data = await $fetch<{
      name: string;
      expected_title: string;
      expected_tax_id: string | null;
      organization_id: string | null;
      invoices: InvoicePublic[];
      total_amount: number;
      has_pending: boolean;
      rights: CampaignRights;
      flow: "direct" | "submit";
      scoped_to_me: boolean;
      my_group_ids?: number[];
      visibility: CampaignVisibility;
      status: CampaignStatus;
    }>(`/api/campaigns/${id}`);
    campaignId.value = id;
    organizationId.value = data.organization_id;
    name.value = data.name;
    expectedTitle.value = data.expected_title;
    expectedTaxId.value = data.expected_tax_id ?? "";
    invoices.value = data.invoices;
    totalAmount.value = data.total_amount;
    hasPending.value = data.has_pending;
    rights.value = data.rights;
    flow.value = data.flow;
    scopedToMe.value = data.scoped_to_me;
    myGroupIds.value = data.my_group_ids ?? [];
    visibility.value = data.visibility;
    status.value = data.status;
    if (data.has_pending) startPolling();
    else stopPolling();
  }

  async function refresh() {
    if (!campaignId.value) return;
    const data = await $fetch<{
      invoices: InvoicePublic[];
      total_amount: number;
      has_pending: boolean;
      rights: CampaignRights;
      flow: "direct" | "submit";
      scoped_to_me: boolean;
      my_group_ids?: number[];
      visibility: CampaignVisibility;
      status: CampaignStatus;
    }>(`/api/campaigns/${campaignId.value}`);
    invoices.value = data.invoices;
    totalAmount.value = data.total_amount;
    hasPending.value = data.has_pending;
    rights.value = data.rights;
    flow.value = data.flow;
    scopedToMe.value = data.scoped_to_me;
    myGroupIds.value = data.my_group_ids ?? [];
    visibility.value = data.visibility;
    status.value = data.status;
    if (!data.has_pending) stopPolling();
  }

  function startPolling() {
    stopPolling();
    void refresh();
    pollTimer = setInterval(() => void refresh(), 3000);
  }
  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function upload(files: File[]) {
    if (!campaignId.value) return;
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    const data = await $fetch<{ ok: boolean; results: InvoicePublic[] }>(
      `/api/campaigns/${campaignId.value}/upload`,
      { method: "POST", body: fd },
    );
    invoices.value = data.results;
    filter.value = "all";
    startPolling();
  }

  async function clearAll() {
    if (!campaignId.value) return;
    await $fetch(`/api/campaigns/${campaignId.value}/clear`, {
      method: "POST",
    });
    invoices.value = [];
    totalAmount.value = 0;
    hasPending.value = false;
    stopPolling();
  }

  async function review(
    id: number,
    decision: "qualified" | "unqualified",
    manualAmount?: number,
  ) {
    if (!campaignId.value) return;
    const body: { decision: string; manual_amount?: number } = { decision };
    if (manualAmount != null) body.manual_amount = manualAmount;
    const data = await $fetch<{
      ok: boolean;
      record: InvoicePublic;
      total_amount: number;
      msg?: string;
    }>(`/api/campaigns/${campaignId.value}/review/${id}`, {
      method: "POST",
      body,
    });
    if (!data.ok) throw new Error(data.msg || "审核失败");
    const idx = invoices.value.findIndex((i) => i.id === id);
    if (idx >= 0) invoices.value[idx] = data.record;
    totalAmount.value = data.total_amount;
  }

  /** Submit one of the caller's own draft invoices for review (submit flow). */
  async function submitInvoice(id: number) {
    if (!campaignId.value) return;
    const data = await $fetch<{ ok: boolean; record: InvoicePublic }>(
      `/api/campaigns/${campaignId.value}/invoices/${id}/submit`,
      { method: "POST" },
    );
    if (!data.ok) throw new Error("提交失败");
    const idx = invoices.value.findIndex((i) => i.id === id);
    if (idx >= 0) invoices.value[idx] = data.record;
  }

  /** Submit all of the caller's own submittable drafts, then refresh. */
  async function submitAll() {
    if (!campaignId.value) return;
    const data = await $fetch<{ ok: boolean; submitted: number }>(
      `/api/campaigns/${campaignId.value}/submit-all`,
      { method: "POST" },
    );
    if (!data.ok) throw new Error("提交失败");
    await refresh();
    return data.submitted;
  }

  async function emailReport(to: string) {
    if (!campaignId.value) return;
    return await $fetch<{
      ok: boolean;
      total: number;
      count: number;
      msg?: string;
    }>(`/api/campaigns/${campaignId.value}/report`, {
      method: "POST",
      body: { to },
    });
  }

  const counts = computed(() => {
    const c = {
      all: invoices.value.length,
      qualified: 0,
      review: 0,
      unqualified: 0,
    } as Record<string, number>;
    for (const i of invoices.value) {
      if (i.status in c) c[i.status] = (c[i.status] ?? 0) + 1;
    }
    return c;
  });

  const filtered = computed(() => {
    let list = invoices.value;
    if (filter.value !== "all")
      list = list.filter((i) => i.status === filter.value);
    const kw = search.value.trim().toLowerCase();
    if (kw) list = list.filter((i) => i.filename.toLowerCase().includes(kw));
    return list;
  });

  const doneCount = computed(
    () =>
      invoices.value.filter(
        (i) => i.status !== "pending" && i.status !== "processing",
      ).length,
  );

  return {
    campaignId,
    organizationId,
    name,
    expectedTitle,
    expectedTaxId,
    invoices,
    totalAmount,
    hasPending,
    rights,
    flow,
    scopedToMe,
    myGroupIds,
    visibility,
    status,
    filter,
    search,
    counts,
    filtered,
    doneCount,
    createCampaign,
    resume,
    refresh,
    startPolling,
    stopPolling,
    upload,
    clearAll,
    review,
    submitInvoice,
    submitAll,
    emailReport,
  };
}

/** Fetch the caller's accessible campaigns: personal / org / collaborations. */
export async function listCampaigns(): Promise<{
  personal: CampaignPublic[];
  organizations: CampaignPublic[];
  collaborations: CampaignPublic[];
}> {
  const data = await $fetch<{
    personal: CampaignPublic[];
    organizations: CampaignPublic[];
    collaborations: CampaignPublic[];
  }>("/api/campaigns");
  return {
    personal: data.personal,
    organizations: data.organizations,
    collaborations: data.collaborations,
  };
}
