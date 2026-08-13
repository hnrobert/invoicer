<script setup lang="ts">
import type { MailConfigClient } from '~/composables/useInvoice'

definePageMeta({ layout: 'default' })
useHead({ title: '邮件设置' })

const loading = ref(true)
const saving = ref(false)
const testing = ref(false)

// form state — mirror MailConfigInput
const smtpServer = ref('')
const smtpPort = ref(465)
const useSsl = ref(true)
const useTls = ref(false)
const usePassword = ref(true)
const senderEmail = ref('')
const senderEmailDisplay = ref('')
const senderDomain = ref('')
const senderPassword = ref('') // only sent when non-empty
const hasPassword = ref(false)
const maxLenRecipientEmail = ref(200)
const maxLenSubject = ref(200)
const maxLenBody = ref(2000)

const testTo = ref('')

function applyConfig(c: MailConfigClient | null) {
  if (!c) return
  smtpServer.value = c.smtpServer
  smtpPort.value = c.smtpPort
  useSsl.value = c.useSsl
  useTls.value = c.useTls
  usePassword.value = c.usePassword
  senderEmail.value = c.senderEmail
  senderEmailDisplay.value = c.senderEmailDisplay
  senderDomain.value = c.senderDomain
  hasPassword.value = c.hasPassword
  maxLenRecipientEmail.value = c.maxLenRecipientEmail
  maxLenSubject.value = c.maxLenSubject
  maxLenBody.value = c.maxLenBody
}

async function load() {
  loading.value = true
  try {
    const data = await $fetch<{ config: MailConfigClient | null }>('/api/mail/config')
    applyConfig(data.config)
  } catch (e) {
    toast.error('加载配置失败：' + (e as Error).message)
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!smtpServer.value.trim()) {
    toast.error('请填写 SMTP 服务器')
    return
  }
  if (usePassword.value && !senderEmail.value.trim()) {
    toast.error('开启密码认证时需填写登录邮箱')
    return
  }
  saving.value = true
  try {
    const body: Record<string, unknown> = {
      smtpServer: smtpServer.value.trim(),
      smtpPort: Number(smtpPort.value),
      useSsl: useSsl.value,
      useTls: useTls.value,
      usePassword: usePassword.value,
      senderEmail: senderEmail.value.trim(),
      senderEmailDisplay: senderEmailDisplay.value.trim(),
      senderDomain: senderDomain.value.trim(),
      maxLenRecipientEmail: Number(maxLenRecipientEmail.value),
      maxLenSubject: Number(maxLenSubject.value),
      maxLenBody: Number(maxLenBody.value),
    }
    if (senderPassword.value) body.senderPassword = senderPassword.value
    const data = await $fetch<{ config: MailConfigClient | null }>('/api/mail/config', {
      method: 'POST',
      body,
    })
    applyConfig(data.config)
    senderPassword.value = ''
    toast.success('邮件配置已保存')
  } catch (e) {
    toast.error('保存失败：' + (e as Error).message)
  } finally {
    saving.value = false
  }
}

async function testSend() {
  if (!testTo.value.trim()) {
    toast.error('请填写测试收件人邮箱')
    return
  }
  testing.value = true
  try {
    await $fetch('/api/mail/test', { method: 'POST', body: { to: testTo.value.trim() } })
    toast.success('测试邮件已发送，请查收')
  } catch (e) {
    toast.error('发送失败：' + (e as Error).message)
  } finally {
    testing.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-center gap-2 text-sm text-muted-foreground">
      <NuxtLink to="/" class="hover:text-foreground"><Icon spec="ArrowLeft" :size="14" /> 返回</NuxtLink>
      <span>/</span>
      <span class="text-foreground">邮件设置</span>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>SMTP 邮件配置</CardTitle>
        <CardDescription>用于发送审核报告的邮件服务器信息。密码仅在重新输入时覆盖，留空则保留原密码。</CardDescription>
      </CardHeader>
      <CardContent v-if="loading" class="py-10 text-center text-sm text-muted-foreground">加载中…</CardContent>
      <CardContent v-else class="flex flex-col gap-5">
        <!-- SMTP -->
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="flex flex-col gap-2">
            <Label>SMTP 服务器</Label>
            <Input v-model="smtpServer" placeholder="smtp.example.com" />
          </div>
          <div class="flex flex-col gap-2">
            <Label>端口</Label>
            <Input v-model.number="smtpPort" type="number" placeholder="465" />
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-5 text-sm">
          <label class="flex items-center gap-2">
            <input v-model="useSsl" type="checkbox" class="size-4 accent-[var(--color-primary,#F7D447)]" />
            <span>SSL / 隐式 TLS（端口 465）</span>
          </label>
          <label class="flex items-center gap-2">
            <input v-model="useTls" type="checkbox" class="size-4 accent-[var(--color-primary,#F7D447)]" />
            <span>STARTTLS（端口 587/25）</span>
          </label>
          <label class="flex items-center gap-2">
            <input v-model="usePassword" type="checkbox" class="size-4 accent-[var(--color-primary,#F7D447)]" />
            <span>需要密码认证</span>
          </label>
        </div>

        <!-- Sender -->
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="flex flex-col gap-2">
            <Label>登录邮箱 / 发信地址</Label>
            <Input v-model="senderEmail" :disabled="!usePassword" placeholder="noreply@example.com" />
          </div>
          <div class="flex flex-col gap-2">
            <Label>显示发件人（可选）</Label>
            <Input v-model="senderEmailDisplay" placeholder="财务系统" />
          </div>
          <div class="flex flex-col gap-2">
            <Label>登录密码 / 授权码</Label>
            <Input v-model="senderPassword" type="password" :disabled="!usePassword" :placeholder="hasPassword ? '（已设置，留空保留）' : '输入密码或授权码'" />
          </div>
          <div class="flex flex-col gap-2">
            <Label>发信域名（Message-ID 后缀，可选）</Label>
            <Input v-model="senderDomain" placeholder="example.com" />
          </div>
        </div>

        <!-- Limits -->
        <details class="rounded-lg border p-3 text-sm">
          <summary class="cursor-pointer font-medium">长度限制（高级）</summary>
          <div class="mt-3 grid gap-4 sm:grid-cols-3">
            <div class="flex flex-col gap-2">
              <Label>收件人邮箱最大长度</Label>
              <Input v-model.number="maxLenRecipientEmail" type="number" />
            </div>
            <div class="flex flex-col gap-2">
              <Label>主题最大长度</Label>
              <Input v-model.number="maxLenSubject" type="number" />
            </div>
            <div class="flex flex-col gap-2">
              <Label>正文最大长度</Label>
              <Input v-model.number="maxLenBody" type="number" />
            </div>
          </div>
        </details>

        <div class="flex flex-wrap gap-2">
          <Button :disabled="saving" @click="save">
            <Icon spec="Save" :size="16" />
            {{ saving ? '保存中…' : '保存配置' }}
          </Button>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>发送测试邮件</CardTitle>
        <CardDescription>保存配置后，发一封测试邮件验证 SMTP 是否通畅。</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div class="flex flex-1 flex-col gap-2">
          <Label>测试收件人</Label>
          <Input v-model="testTo" type="email" placeholder="you@example.com" />
        </div>
        <Button :disabled="testing" variant="outline" @click="testSend">
          <Icon spec="Send" :size="16" />
          {{ testing ? '发送中…' : '发送测试' }}
        </Button>
      </CardContent>
    </Card>
  </div>
</template>
