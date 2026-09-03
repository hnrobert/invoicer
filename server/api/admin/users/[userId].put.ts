// API layer: gate by superadmin, delegate to server/service.
import { requireSuperAdmin } from "#server/utils/superadmin";
import { updateUser } from "#server/service/admin/users.service";
import type { AdminUserUpdateBody } from "#shared/api";

/** PUT /api/admin/users/:id — edit name / email / emailVerified. */
export default defineEventHandler(async (event) => {
  const actor = await requireSuperAdmin(event);
  const body = await readBody<AdminUserUpdateBody>(event);
  return {
    ok: true,
    user: await updateUser(actor.id, getRouterParam(event, "userId")!, body),
  };
});
