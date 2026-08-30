// API layer: parse the request, delegate to server/service.
import { requireSuperAdmin } from "#server/utils/superadmin";
import { savePostSchemas } from "#server/service/mail/config";

/** PUT /api/mail/post-schemas — persist the shared field-map schema library. */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event);
  const body = await readBody<Record<string, unknown>>(event);
  return savePostSchemas(body ?? {});
});
