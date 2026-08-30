// API layer: parse the request, delegate to server/service.
import { requireSuperAdmin } from "#server/utils/superadmin";
import { saveMailConfigFromClient } from "#server/service/mail/config";

/** POST /api/mail/config — persist the site mail configuration. */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event);
  const body = await readBody<Record<string, unknown>>(event);
  return saveMailConfigFromClient(body ?? {});
});
