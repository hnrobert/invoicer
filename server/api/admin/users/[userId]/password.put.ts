// API layer: gate by superadmin, delegate to server/service.
import { requireSuperAdmin } from "#server/utils/superadmin";
import { setUserPassword } from "#server/service/admin/users.service";
import type { AdminPasswordBody } from "#shared/api";

/** PUT /api/admin/users/:id/password — admin sets a new password. */
export default defineEventHandler(async (event) => {
  const actor = await requireSuperAdmin(event);
  const body = await readBody<AdminPasswordBody>(event);
  return setUserPassword(
    actor.id,
    getRouterParam(event, "userId")!,
    body?.password,
  );
});
