// API layer: gate by superadmin, delegate to server/service.
import { requireSuperAdmin } from "#server/utils/superadmin";
import { deleteUser } from "#server/service/admin/users.service";

/** DELETE /api/admin/users/:id — delete a user (org owners must transfer first). */
export default defineEventHandler(async (event) => {
  const actor = await requireSuperAdmin(event);
  return deleteUser(actor.id, getRouterParam(event, "userId")!);
});
