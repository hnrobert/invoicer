import type { CampaignPublic, InvoicePublic, InvoiceStatus } from "#shared/types";

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
}

export type FilterKey = "all" | InvoiceStatus;

/** Options when starting a new campaign. */
export interface CreateCampaignOptions {
  organizationId?: string | null;
  name?: string;
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
  const filter = ref<FilterKey>("all");
  const search = ref("");
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  /** Create a new campaign under the current scope (personal or active org). */
  async function createCampaign(title: string, taxId: string, opts: CreateCampaignOptions = {}) {
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
    }>(`/api/campaigns/${id}`);
    campaignId.value = id;
    organizationId.value = data.organization_id;
    name.value = data.name;
    expectedTitle.value = data.expected_title;
    expectedTaxId.value = data.expected_tax_id ?? "";
    invoices.value = data.invoices;
    totalAmount.value = data.total_amount;
    hasPending.value = data.has_pending;
    if (data.has_pending) startPolling();
    else stopPolling();
  }

  async function refresh() {
    if (!campaignId.value) return;
    const data = await $fetch<{
      invoices: InvoicePublic[];
      total_amount: number;
      has_pending: boolean;
    }>(`/api/campaigns/${campaignId.value}`);
    invoices.value = data.invoices;
    totalAmount.value = data.total_amount;
    hasPending.value = data.has_pending;
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
    emailReport,
  };
}

/** Fetch the caller's accessible campaigns, grouped personal vs org. */
export async function listCampaigns(): Promise<{
  personal: CampaignPublic[];
  organizations: CampaignPublic[];
}> {
  const data = await $fetch<{
    personal: CampaignPublic[];
    organizations: CampaignPublic[];
  }>("/api/campaigns");
  return { personal: data.personal, organizations: data.organizations };
}
