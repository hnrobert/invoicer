import { getSessionUser } from "#server/utils/campaign";
import { listEmails } from "#server/utils/emails";

/** The caller's linked emails (primary first, then secondaries). */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  return { ok: true, emails: await listEmails(user.id) };
});
