// API layer: parse the request, delegate to server/service.
import { requireSuperAdmin } from "#server/utils/superadmin";
import { sendTestMail } from "#server/service/mail/test";
import type { RecipientBody } from "#shared/api";

/** POST /api/mail/test — send a test email through the configured channel. */
export default defineEventHandler(async (event) => {
  const user = await requireSuperAdmin(event);
  const { to } = await readBody<RecipientBody>(event);
  return sendTestMail(user, to);
});
