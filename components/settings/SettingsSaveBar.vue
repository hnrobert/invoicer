<script setup lang="ts">
/**
 * Sticky bottom save/discard bar (ported from verifier-gateway's SaveBar) —
 * the unified "modify & save" affordance for every settings surface. Slides up
 * while there are unsaved changes (or right after a successful save, to flash
 * "✓ 已保存" inline before retracting). The actual dirty/save/discard logic
 * lives in each page; this is pure presentation.
 */
defineProps<{ dirty: boolean; saving: boolean; saved?: boolean }>();
defineEmits<{ save: []; discard: [] }>();
const { t } = useI18n();
</script>

<template>
  <Transition name="savebar">
    <div
      v-if="dirty || saved"
      class="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur lg:left-56"
    >
      <div
        class="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8"
      >
        <span class="text-sm text-muted-foreground">
          <template v-if="saved">✓ {{ t("settings.savebar.saved") }}</template>
          <template v-else>{{ t("settings.savebar.unsaved") }}</template>
        </span>
        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            :disabled="saving || saved"
            @click="$emit('discard')"
          >
            {{ t("settings.savebar.discard") }}
          </Button>
          <Button size="sm" :disabled="saving || saved" @click="$emit('save')">
            {{
              saving
                ? t("settings.savebar.saving")
                : saved
                  ? t("settings.savebar.saved")
                  : t("settings.savebar.save")
            }}
          </Button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.savebar-enter-active,
.savebar-leave-active {
  transition:
    transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.25s;
}
.savebar-enter-from,
.savebar-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
