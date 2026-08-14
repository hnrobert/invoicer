/** Extract a human message from a `$fetch` / `createError` rejection. */
export function messageFromError(e: unknown, fallback: string): string {
  if (e && typeof e === "object") {
    const any = e as {
      data?: { statusMessage?: string; message?: string };
      statusMessage?: string;
      message?: string;
    };
    return (
      any.data?.statusMessage ||
      any.data?.message ||
      any.statusMessage ||
      any.message ||
      fallback
    );
  }
  return fallback;
}
