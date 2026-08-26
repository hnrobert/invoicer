<script setup lang="ts">
// Three-way leave confirmation (ported from verifier-gateway): Stay /
// Discard / Save & leave. Rendered when a useUnsavedLeaveGuard blocks.
defineProps<{ open: boolean; saving?: boolean }>();
defineEmits<{ stay: []; discard: []; save: [] }>();
const { t } = useI18n();
</script>

<template>
  <Transition name="fade">
    <div
      v-if="open"
      class="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4"
      @click.self="$emit('stay')"
    >
      <Card class="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{{ t("settings.savebar.dialogTitle") }}</CardTitle>
          <CardDescription>{{
            t("settings.savebar.dialogDesc")
          }}</CardDescription>
        </CardHeader>
        <CardContent class="flex gap-2">
          <Button variant="outline" class="flex-1" @click="$emit('stay')">
            {{ t("settings.savebar.stay") }}
          </Button>
          <Button
            variant="outline"
            class="flex-1"
            :disabled="saving"
            @click="$emit('discard')"
          >
            {{ t("settings.savebar.discard") }}
          </Button>
          <Button class="flex-1" :disabled="saving" @click="$emit('save')">
            {{ t("settings.savebar.saveLeave") }}
          </Button>
        </CardContent>
      </Card>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
