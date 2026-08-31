// API layer: gate by superadmin, delegate to server/service.
import { requireSuperAdmin } from "#server/utils/superadmin";
import { listUsers } from "#server/service/admin/users.service";

/** GET /api/admin/users — list all registered users. */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event);
  return listUsers();
});
