// API layer: gate by superadmin, delegate to server/service.
import { requireSuperAdmin } from "#server/utils/superadmin";
import { setSuperAdmin } from "#server/service/admin/users.service";
import type { AdminGrantBody } from "#shared/api";

/** PUT /api/admin/users/:id/superadmin — grant/revoke the table grant. */
export default defineEventHandler(async (event) => {
  const actor = await requireSuperAdmin(event);
  const body = await readBody<AdminGrantBody>(event);
  return setSuperAdmin(actor.id, getRouterParam(event, "userId")!, body);
});
