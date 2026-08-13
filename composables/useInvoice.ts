import type { InvoicePublic, InvoiceStatus } from '#shared/types'

export interface MailConfigClient {
  smtpServer: string
  smtpPort: number
  useSsl: boolean
  useTls: boolean
  usePassword: boolean
  senderEmail: string
  senderEmailDisplay: string
  senderDomain: string
  hasPassword: boolean
  maxLenRecipientEmail: number
  maxLenSubject: number
  maxLenBody: number
}

export type FilterKey = 'all' | InvoiceStatus

/** Reactive state + API calls for the invoice audit workflow. */
export function useInvoice() {
  const sessionId = ref<number | null>(null)
  const expectedTitle = ref('')
  const expectedTaxId = ref('')
  const invoices = ref<InvoicePublic[]>([])
  const totalAmount = ref(0)
  const hasPending = ref(false)
  const filter = ref<FilterKey>('all')
  const search = ref('')
  let pollTimer: ReturnType<typeof setInterval> | null = null

  async function createSession(title: string, taxId: string) {
    const data = await $fetch<{ ok: boolean; session_id: number; msg?: string }>('/api/session', {
      method: 'POST',
      body: { title, tax_id: taxId },
    })
    if (!data.ok) throw new Error(data.msg || '创建会话失败')
    sessionId.value = data.session_id
    expectedTitle.value = title
    expectedTaxId.value = taxId
  }

  async function refresh() {
    if (!sessionId.value) return
    const data = await $fetch<{
      invoices: InvoicePublic[]
      total_amount: number
      has_pending: boolean
    }>(`/api/invoices/${sessionId.value}`)
    invoices.value = data.invoices
    totalAmount.value = data.total_amount
    hasPending.value = data.has_pending
    if (!data.has_pending) stopPolling()
  }

  function startPolling() {
    stopPolling()
    void refresh()
    pollTimer = setInterval(() => void refresh(), 3000)
  }
  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  async function upload(files: File[]) {
    const fd = new FormData()
    fd.append('session_id', String(sessionId.value))
    for (const f of files) fd.append('files', f)
    const data = await $fetch<{ ok: boolean; results: InvoicePublic[] }>('/api/upload', {
      method: 'POST',
      body: fd,
    })
    invoices.value = data.results
    filter.value = 'all'
    startPolling()
  }

  async function clearAll() {
    if (!sessionId.value) return
    await $fetch(`/api/clear/${sessionId.value}`, { method: 'POST' })
    invoices.value = []
    totalAmount.value = 0
    hasPending.value = false
    stopPolling()
  }

  async function review(
    id: number,
    decision: 'qualified' | 'unqualified',
    manualAmount?: number,
  ) {
    const body: { decision: string; manual_amount?: number } = { decision }
    if (manualAmount != null) body.manual_amount = manualAmount
    const data = await $fetch<{
      ok: boolean
      record: InvoicePublic
      total_amount: number
      msg?: string
    }>(`/api/review/${sessionId.value}/${id}`, { method: 'POST', body })
    if (!data.ok) throw new Error(data.msg || '审核失败')
    const idx = invoices.value.findIndex((i) => i.id === id)
    if (idx >= 0) invoices.value[idx] = data.record
    totalAmount.value = data.total_amount
  }

  async function emailReport(to: string) {
    return await $fetch<{ ok: boolean; total: number; count: number; msg?: string }>(
      `/api/report/${sessionId.value}`,
      { method: 'POST', body: { to } },
    )
  }

  const counts = computed(() => {
    const c = { all: invoices.value.length, qualified: 0, review: 0, unqualified: 0 } as Record<
      string,
      number
    >
    for (const i of invoices.value) {
      if (i.status in c) c[i.status] = (c[i.status] ?? 0) + 1
    }
    return c
  })

  const filtered = computed(() => {
    let list = invoices.value
    if (filter.value !== 'all') list = list.filter((i) => i.status === filter.value)
    const kw = search.value.trim().toLowerCase()
    if (kw) list = list.filter((i) => i.filename.toLowerCase().includes(kw))
    return list
  })

  const doneCount = computed(
    () => invoices.value.filter((i) => i.status !== 'pending' && i.status !== 'processing').length,
  )

  return {
    sessionId,
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
    createSession,
    refresh,
    startPolling,
    stopPolling,
    upload,
    clearAll,
    review,
    emailReport,
  }
}
