<script setup lang="ts">
import type { InvoicePublic } from '#shared/types'

definePageMeta({ layout: 'default' })
useHead({ title: '发票审核' })

const inv = useInvoice()

// ---------- step 1: info + history ----------
const title = ref('')
const taxId = ref('')
const HISTORY_KEY = 'invoicer.history'
const history = ref<{ title: string; taxId: string }[]>([])
function loadHistory() {
  try {
    history.value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  } catch {
    history.value = []
  }
}
function saveHistory() {
  if (!title.value) return
  const next = [{ title: title.value, taxId: taxId.value }]
    .concat(history.value.filter((h) => h.title !== title.value))
    .slice(0, 5)
  history.value = next
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
}
loadHistory()

const step2 = ref(false)
const step3 = ref(false)
const creating = ref(false)
async function createSession() {
  if (!title.value && !taxId.value) {
    toast.error('请至少填写发票抬头或税号')
    return
  }
  creating.value = true
  try {
    await inv.createSession(title.value.trim(), taxId.value.trim())
    saveHistory()
    step2.value = true
    await nextTick()
    document.getElementById('step-upload')?.scrollIntoView({ behavior: 'smooth' })
  } catch (e) {
    toast.error((e as Error).message || '创建会话失败')
  } finally {
    creating.value = false
  }
}

// ---------- step 2: upload ----------
const selectedFiles = ref<File[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)
const uploading = ref(false)

function pickFiles(list: FileList | null) {
  if (!list) return
  selectedFiles.value = Array.from(list).filter((f) =>
    /\.(pdf|jpe?g|png|webp|bmp|gif|tiff?)$/i.test(f.name),
  )
}
function onDrop(e: DragEvent) {
  dragOver.value = false
  pickFiles(e.dataTransfer?.files ?? null)
}
async function startUpload() {
  if (!inv.sessionId || selectedFiles.value.length === 0) return
  uploading.value = true
  try {
    await inv.upload(selectedFiles.value)
    step3.value = true
    await nextTick()
    document.getElementById('step-result')?.scrollIntoView({ behavior: 'smooth' })
  } catch (e) {
    toast.error('上传失败：' + (e as Error).message)
  } finally {
    uploading.value = false
  }
}
async function resetUpload() {
  if (!confirm('确定重新上传吗？将清除当前发票文件，但保留抬头和税号。')) return
  await inv.clearAll()
  selectedFiles.value = []
  step3.value = false
  await nextTick()
  document.getElementById('step-upload')?.scrollIntoView({ behavior: 'smooth' })
}

onUnmounted(() => inv.stopPolling())

// ---------- step 3: results ----------
const expanded = ref<Set<number>>(new Set())
function toggleExpand(id: number) {
  const s = new Set(expanded.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expanded.value = s
}

function fmtAmount(i: InvoicePublic): string {
  const amt = i.extractedAmount ?? i.manualAmount
  return amt != null ? `¥${amt.toFixed(2)}` : '—'
}
function isManual(i: InvoicePublic): boolean {
  return i.extractedAmount == null && i.manualAmount != null
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  qualified: { label: '合格', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  review: { label: '二次审核', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  unqualified: { label: '不合格', cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-400' },
  pending: { label: '等待', cls: 'bg-muted text-muted-foreground' },
  processing: { label: '识别中', cls: 'bg-muted text-muted-foreground' },
  error: { label: '失败', cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-400' },
}
function statusMeta(s: string): { label: string; cls: string } {
  return STATUS_META[s] ?? STATUS_META['error']!
}

const FILTERS: { key: 'all' | 'qualified' | 'review' | 'unqualified'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'qualified', label: '合格' },
  { key: 'review', label: '二次审核' },
  { key: 'unqualified', label: '不合格' },
]

// ---------- manual review modal ----------
const reviewModal = ref(false)
const reviewTarget = ref<InvoicePublic | null>(null)
const manualAmountInput = ref<string>('')
function openReview(i: InvoicePublic) {
  reviewTarget.value = i
  manualAmountInput.value = i.manualAmount != null ? String(i.manualAmount) : ''
  reviewModal.value = true
}
async function submitReview(decision: 'qualified' | 'unqualified') {
  const t = reviewTarget.value
  if (!t) return
  let manual: number | undefined
  const needAmount = t.extractedAmount == null
  if (needAmount) {
    const v = manualAmountInput.value.trim()
    if (decision === 'qualified' && v === '') {
      toast.error('未识别到金额，判定合格前请手动输入发票金额')
      return
    }
    if (v) {
      const n = Number(v)
      if (Number.isNaN(n) || n < 0) {
        toast.error('金额格式不正确')
        return
      }
      manual = n
    }
  }
  try {
    await inv.review(t.id, decision, manual)
    reviewModal.value = false
    toast.success(decision === 'qualified' ? '已判定合格' : '已判定不合格')
  } catch (e) {
    toast.error((e as Error).message)
  }
}

// ---------- email report modal ----------
const reportModal = ref(false)
const reportTo = ref('')
const sendingReport = ref(false)
async function sendReport() {
  if (!reportTo.value.trim()) {
    toast.error('请填写收件人邮箱')
    return
  }
  sendingReport.value = true
  try {
    const r = await inv.emailReport(reportTo.value.trim())
    toast.success(`已发送：合规 ¥${r.total.toFixed(2)} · 共 ${r.count} 张`)
    reportModal.value = false
  } catch (e) {
    toast.error('发送失败：' + (e as Error).message)
  } finally {
    sendingReport.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- STEP 1 — info -->
    <Card id="step-info">
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <span class="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
          录入发票信息
        </CardTitle>
        <CardDescription>填写需要核验的发票抬头和税号，系统将以此为标准匹配上传的发票。</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="flex flex-col gap-2">
            <Label>发票抬头</Label>
            <Input v-model="title" placeholder="例如：腾讯科技（深圳）有限公司" />
          </div>
          <div class="flex flex-col gap-2">
            <Label>税号</Label>
            <Input v-model="taxId" placeholder="18 位统一社会信用代码" />
          </div>
        </div>
        <div v-if="history.length" class="flex flex-wrap items-center gap-2">
          <span class="text-xs text-muted-foreground">最近输入：</span>
          <button
            v-for="h in history"
            :key="h.title"
            type="button"
            class="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-xs hover:bg-accent"
            @click="((title = h.title), (taxId = h.taxId))"
          >
            <Icon spec="Building2" :size="12" />
            {{ h.title }}
          </button>
        </div>
        <Button :disabled="creating" @click="createSession">
          <Icon spec="ArrowRight" :size="16" />
          {{ creating ? '创建中…' : '建立审核会话' }}
        </Button>
      </CardContent>
    </Card>

    <!-- STEP 2 — upload -->
    <Card v-if="step2" id="step-upload">
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <span class="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
          上传发票
        </CardTitle>
        <CardDescription>支持选择整个文件夹或多份 PDF / 图片，系统会逐张识别（PDF 取文本，图片走 OCR）。</CardDescription>
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
          <span class="text-sm font-medium">点击选择文件夹 / 拖拽文件到此处</span>
          <span class="text-xs text-muted-foreground">已选 <b>{{ selectedFiles.length }}</b> 个文件</span>
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
          <Button :disabled="selectedFiles.length === 0 || uploading" @click="startUpload">
            <Icon spec="ScanLine" :size="16" />
            {{ uploading ? '上传中…' : '开始识别与审核' }}
          </Button>
          <Button variant="ghost" @click="resetUpload">重新上传</Button>
        </div>
      </CardContent>
    </Card>

    <!-- STEP 3 — results -->
    <Card v-if="step3" id="step-result">
      <CardHeader class="flex-row items-center justify-between">
        <div>
          <CardTitle class="flex items-center gap-2">
            <span class="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
            审核结果
          </CardTitle>
          <CardDescription>抬头：{{ inv.expectedTitle }} · 税号：{{ inv.expectedTaxId || '—' }}</CardDescription>
        </div>
        <Button variant="outline" size="sm" @click="reportModal = true">
          <Icon spec="Send" :size="14" />
          发送报告
        </Button>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <!-- summary -->
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="rounded-lg border bg-card p-3">
            <div class="text-xs text-muted-foreground">合规总金额</div>
            <div class="text-lg font-bold text-primary">¥{{ inv.totalAmount.value.toFixed(2) }}</div>
          </div>
          <div class="rounded-lg border bg-card p-3">
            <div class="text-xs text-muted-foreground">合格</div>
            <div class="text-lg font-bold text-emerald-600">{{ inv.counts.value.qualified }}</div>
          </div>
          <div class="rounded-lg border bg-card p-3">
            <div class="text-xs text-muted-foreground">二次审核</div>
            <div class="text-lg font-bold text-amber-600">{{ inv.counts.value.review }}</div>
          </div>
          <div class="rounded-lg border bg-card p-3">
            <div class="text-xs text-muted-foreground">不合格</div>
            <div class="text-lg font-bold text-rose-600">{{ inv.counts.value.unqualified }}</div>
          </div>
        </div>

        <!-- progress -->
        <div v-if="inv.hasPending.value" class="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon spec="LoaderCircle" :size="14" class="animate-spin" />
          识别进度 {{ inv.doneCount.value }} / {{ inv.invoices.value.length }}
        </div>

        <!-- filter tabs -->
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="f in FILTERS"
            :key="f.key"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
            :class="inv.filter.value === f.key ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'"
            @click="inv.filter.value = f.key"
          >
            {{ f.label }}
            <span class="opacity-70">{{ inv.counts.value[f.key] ?? 0 }}</span>
          </button>
          <div class="relative ml-auto">
            <Icon spec="Search" :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input v-model="inv.search.value" placeholder="搜索文件名…" class="h-8 w-48 pl-8 text-xs" />
          </div>
        </div>

        <!-- table -->
        <div class="overflow-x-auto rounded-lg border">
          <table class="w-full text-sm">
            <thead class="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th class="px-3 py-2 text-left font-medium">文件名</th>
                <th class="px-3 py-2 text-left font-medium">识别抬头</th>
                <th class="px-3 py-2 text-left font-medium">税号</th>
                <th class="px-3 py-2 text-right font-medium">金额</th>
                <th class="px-3 py-2 text-left font-medium">状态</th>
                <th class="px-3 py-2 text-left font-medium">原因</th>
                <th class="px-3 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              <template v-if="inv.filtered.value.length">
                <template v-for="i in inv.filtered.value" :key="i.id">
                  <tr
                    class="cursor-pointer border-t hover:bg-accent/40"
                    @click="toggleExpand(i.id)"
                  >
                    <td class="max-w-[220px] truncate px-3 py-2" :title="i.filename">{{ i.filename }}</td>
                    <td class="max-w-[160px] truncate px-3 py-2 text-muted-foreground" :title="i.extractedTitle ?? ''">{{ i.extractedTitle || '—' }}</td>
                    <td class="px-3 py-2 font-mono text-xs text-muted-foreground">{{ i.extractedTaxId || '—' }}</td>
                    <td class="px-3 py-2 text-right tabular-nums">
                      {{ fmtAmount(i) }}
                      <span v-if="isManual(i)" class="text-[10px] text-muted-foreground">(手动)</span>
                    </td>
                    <td class="px-3 py-2">
                      <span class="inline-flex rounded px-2 py-0.5 text-xs font-medium" :class="statusMeta(i.status).cls">{{ statusMeta(i.status).label }}</span>
                    </td>
                    <td class="max-w-[200px] truncate px-3 py-2 text-xs text-muted-foreground" :title="i.reason ?? ''">{{ i.reason || '—' }}</td>
                    <td class="px-3 py-2 text-right" @click.stop>
                      <Button v-if="i.status === 'review'" variant="outline" size="sm" @click="openReview(i)">手动审核</Button>
                      <span v-else-if="i.status === 'error'" class="text-xs text-rose-600">识别失败</span>
                      <span v-else class="text-xs text-muted-foreground">—</span>
                    </td>
                  </tr>
                  <tr v-if="expanded.has(i.id)">
                    <td colspan="7" class="border-t bg-muted/20 p-3">
                      <embed
                        v-if="i.fileType === 'pdf'"
                        :src="`/api/invoice/${i.id}/file`"
                        type="application/pdf"
                        class="h-[480px] w-full rounded border"
                      />
                      <img v-else :src="`/api/invoice/${i.id}/file`" class="mx-auto max-h-[480px] rounded border" />
                    </td>
                  </tr>
                </template>
              </template>
              <tr v-else>
                <td colspan="7" class="px-3 py-10 text-center text-sm text-muted-foreground">该分类下暂无发票</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>

    <!-- manual review modal -->
    <div v-if="reviewModal && reviewTarget" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="reviewModal = false">
      <Card class="w-full max-w-md">
        <CardHeader>
          <CardTitle>手动审核</CardTitle>
          <CardDescription class="truncate">{{ reviewTarget.filename }}</CardDescription>
        </CardHeader>
        <CardContent class="flex flex-col gap-3 text-sm">
          <div><span class="text-muted-foreground">识别抬头：</span>{{ reviewTarget.extractedTitle || '未识别' }}</div>
          <div><span class="text-muted-foreground">识别税号：</span><span class="font-mono text-xs">{{ reviewTarget.extractedTaxId || '未识别' }}</span></div>
          <div><span class="text-muted-foreground">识别金额：</span>{{ reviewTarget.extractedAmount != null ? '¥' + reviewTarget.extractedAmount.toFixed(2) : '未识别' }}</div>
          <div v-if="reviewTarget.extractedAmount == null" class="flex flex-col gap-1.5">
            <Label>手动输入发票金额（元）<span class="text-rose-600"> *未识别到金额</span></Label>
            <Input v-model="manualAmountInput" type="number" step="0.01" placeholder="如 1234.56" />
          </div>
          <p class="text-xs text-muted-foreground">判定「合格」后金额计入总额；「不合格」不计入。</p>
        </CardContent>
        <CardFooter class="justify-end gap-2">
          <Button variant="ghost" @click="reviewModal = false">取消</Button>
          <Button variant="destructive" @click="submitReview('unqualified')">判定不合格</Button>
          <Button @click="submitReview('qualified')">判定合格</Button>
        </CardFooter>
      </Card>
    </div>

    <!-- email report modal -->
    <div v-if="reportModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="reportModal = false">
      <Card class="w-full max-w-md">
        <CardHeader>
          <CardTitle>发送审核报告</CardTitle>
          <CardDescription>将本批审核结果（含明细表与合规金额）以邮件发送。</CardDescription>
        </CardHeader>
        <CardContent class="flex flex-col gap-2">
          <Label>收件人邮箱</Label>
          <Input v-model="reportTo" type="email" placeholder="finance@example.com" />
          <p class="text-xs text-muted-foreground">需先在 <NuxtLink to="/settings" class="underline">邮件设置</NuxtLink> 配置 SMTP。</p>
        </CardContent>
        <CardFooter class="justify-end gap-2">
          <Button variant="ghost" :disabled="sendingReport" @click="reportModal = false">取消</Button>
          <Button :disabled="sendingReport" @click="sendReport">
            <Icon spec="Send" :size="14" />
            {{ sendingReport ? '发送中…' : '发送' }}
          </Button>
        </CardFooter>
      </Card>
    </div>
  </div>
</template>
