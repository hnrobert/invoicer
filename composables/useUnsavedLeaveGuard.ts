import type { Ref } from "vue";

/**
 * Prompts before navigating away with unsaved changes (the shared guard behind
 * every SettingsSaveBar). When `isDirty` (and not mid-`saving`), navigation is
 * cancelled, the intended destination remembered, and `confirmLeave` flips
 * true — bind it to an <UnsavedLeaveDialog>.
 *
 * Two router hooks because settings surfaces live in two navigation styles:
 * - onBeforeRouteLeave for real page exits (/settings → /),
 * - onBeforeRouteUpdate for section switches that only change the query
 *   (?section=mail → ?section=profile) — the route record is reused there, so
 *   leave guards never fire.
 * A beforeunload listener additionally covers browser close / refresh.
 *
 * `proceed()` re-runs navigation to the remembered destination after Discard
 * (dirty now cleared) or Save-and-leave; the re-triggered guard sees a clean
 * state and lets it through, so the user lands where they originally clicked.
 */
export function useUnsavedLeaveGuard(
  isDirty: Ref<boolean>,
  saving: Ref<boolean>,
) {
  const confirmLeave = ref(false);
  const pendingTo = ref<string | null>(null);
  const route = useRoute();

  function block(fullPath: string): boolean {
    if (!isDirty.value || saving.value) return true;
    pendingTo.value = fullPath;
    confirmLeave.value = true;
    return false;
  }

  onBeforeRouteLeave((to) => block(to.fullPath));
  onBeforeRouteUpdate((to) => {
    if (to.fullPath === route.fullPath) return true; // no-op navigation
    return block(to.fullPath);
  });

  // Browser close / refresh while dirty: show the native confirmation.
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (isDirty.value && !saving.value) {
      e.preventDefault();
      e.returnValue = "";
    }
  };
  onMounted(() => window.addEventListener("beforeunload", onBeforeUnload));
  onBeforeUnmount(() =>
    window.removeEventListener("beforeunload", onBeforeUnload),
  );

  function proceed(): void {
    const dest = pendingTo.value;
    confirmLeave.value = false;
    pendingTo.value = null;
    if (dest) void navigateTo(dest);
  }

  return { confirmLeave, proceed };
}
