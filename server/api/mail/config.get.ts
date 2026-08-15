import { getMailConfig, mailConfigToClient } from "#server/utils/mail";
import { requireSuperAdmin } from "#server/utils/superadmin";

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event);
  return { ok: true, config: mailConfigToClient(await getMailConfig()) };
});
