// TEMPORARY debugging sink for the client error-report probe (see
// plugins/error-report.client.ts). Dev only — echoes the captured Vue error
// (component + lifecycle info + stack) into the server log.
export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event);
  console.error(
    `[client-error] ${String(body?.at ?? "")} ${String(body?.message ?? "")}\n` +
      `  component: ${String(body?.component ?? "?")}\n` +
      `  info: ${String(body?.info ?? "?")}\n` +
      `  url: ${String(body?.url ?? "?")}\n` +
      `  stack: ${String(body?.stack ?? "").split("\n").slice(0, 6).join("\n         ")}`,
  );
  return { ok: true };
});
