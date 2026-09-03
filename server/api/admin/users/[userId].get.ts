// API layer: gate by superadmin, delegate to server/service.
import { requireSuperAdmin } from "#server/utils/superadmin";
import { getUserDetail } from "#server/service/admin/users.service";

/** GET /api/admin/users/:id — full profile for the detail dialog. */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event);
  return getUserDetail(getRouterParam(event, "userId")!);
});
