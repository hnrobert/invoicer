// API layer: gate by superadmin, delegate to server/service.
import { requireSuperAdmin } from "#server/utils/superadmin";
import { createUser } from "#server/service/admin/users.service";
import type { AdminUserCreateBody } from "#shared/api";

/** POST /api/admin/users — admin creates an account. */
export default defineEventHandler(async (event) => {
  const actor = await requireSuperAdmin(event);
  const body = await readBody<AdminUserCreateBody>(event);
  return { ok: true, user: await createUser(actor.id, body) };
});
