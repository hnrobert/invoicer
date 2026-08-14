<script setup lang="ts">
// In-app notification bell: unread badge, dropdown list, click-through to the
// notification's link, mark-one / mark-all read.
const { t } = useI18n();

interface Note {
  id: number;
  type: string;
  link: string;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

const open = ref(false);
const notes = ref<Note[]>([]);
const unread = ref(0);
const loaded = ref(false);

async function load() {
  try {
    const data = await $fetch<{ unread: number; notifications: Note[] }>(
      "/api/notifications",
    );
    notes.value = data.notifications;
    unread.value = data.unread;
    loaded.value = true;
  } catch {
    // silent — the bell just stays empty
  }
}

function toggle() {
  open.value = !open.value;
  if (open.value && !loaded.value) void load();
}

async function markAll() {
  if (!unread.value) return;
  await $fetch("/api/notifications/read", { method: "PUT" });
  notes.value = notes.value.map((n) => ({ ...n, read: true }));
  unread.value = 0;
}

async function openNote(n: Note) {
  open.value = false;
  if (!n.read) {
    await $fetch("/api/notifications/read", {
      method: "PUT",
      query: { id: n.id },
    }).catch(() => {});
    n.read = true;
    unread.value = Math.max(0, unread.value - 1);
  }
  if (n.link) navigateTo(n.link);
}

function text(n: Note): string {
  const c = String(n.data.campaign ?? "");
  switch (n.type) {
    case "collaborator.added":
      return t("notify.collabAdded", { campaign: c });
    case "invoice.reviewed":
      return n.data.decision === "qualified"
        ? t("notify.reviewApproved", { filename: String(n.data.filename ?? "") })
        : t("notify.reviewRejected", { filename: String(n.data.filename ?? "") });
    case "campaign.status":
      return t("notify.campaignStatus", {
        campaign: c,
        status: t(`home.settings.st.${n.data.status}`),
      });
    case "transfer.incoming":
      return t("notify.transferIncoming", { campaign: c });
    case "transfer.accepted":
      return t("notify.transferAccepted", { campaign: c });
    case "transfer.canceled":
      return t("notify.transferCanceled", { campaign: c });
    default:
      return n.type;
  }
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

onMounted(() => void load());
</script>

<template>
  <div class="relative">
    <button
      type="button"
      :aria-label="t('notify.title')"
      class="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      @click="toggle"
    >
      <Icon spec="Bell" :size="18" />
      <span
        v-if="unread > 0"
        class="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground"
      >
        {{ unread > 9 ? "9+" : unread }}
      </span>
    </button>

    <div v-if="open" class="fixed inset-0 z-40" @click="open = false" />
    <div
      v-if="open"
      class="absolute right-0 z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-lg border bg-popover shadow-lg"
    >
      <div
        class="flex items-center justify-between border-b px-3 py-2 text-xs font-medium"
      >
        {{ t("notify.title") }}
        <button
          v-if="unread > 0"
          type="button"
          class="text-muted-foreground underline-offset-2 hover:underline"
          @click="markAll"
        >
          {{ t("notify.markAll") }}
        </button>
      </div>
      <button
        v-for="n in notes"
        :key="n.id"
        type="button"
        class="flex w-full flex-col gap-0.5 border-b px-3 py-2 text-left text-xs last:border-b-0 hover:bg-accent/50"
        :class="n.read ? 'opacity-60' : ''"
        @click="openNote(n)"
      >
        <span class="flex items-center gap-1.5">
          <span
            v-if="!n.read"
            class="size-1.5 shrink-0 rounded-full bg-primary"
          />
          <span class="line-clamp-2">{{ text(n) }}</span>
        </span>
        <span class="pl-3 text-[10px] text-muted-foreground">{{
          fmtTime(n.createdAt)
        }}</span>
      </button>
      <p
        v-if="!notes.length"
        class="px-3 py-6 text-center text-xs text-muted-foreground"
      >
        {{ t("notify.empty") }}
      </p>
    </div>
  </div>
</template>
