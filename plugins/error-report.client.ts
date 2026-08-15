// TEMPORARY debugging probe for the Safari client-side crash
// ("null is not an object (evaluating 'currentRenderingInstance.ce')").
// Captures every unhandled Vue error with the failing component's name and
// lifecycle info, and POSTs it to the dev server so the trace lands in the
// terminal log even when the page dies. Remove once the root cause is fixed.
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.config.errorHandler = (err, instance, info) => {
    const name =
      (instance?.$options as { __name?: string } | undefined)?.__name ??
      (instance?.$options as { name?: string } | undefined)?.name ??
      "unknown";
    const payload = {
      message: err instanceof Error ? err.message : String(err),
      stack: (err instanceof Error ? err.stack : "")?.slice(0, 3000) ?? "",
      component: name,
      info,
      url: location.href,
      ua: navigator.userAgent,
      at: new Date().toISOString(),
    };
    console.error("[client-error]", payload);
    // Fire-and-forget; the error page replaces the app anyway.
    void $fetch("/api/_client-error", {
      method: "POST",
      body: payload,
    }).catch(() => {});
  };
});
