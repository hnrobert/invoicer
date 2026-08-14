import { getSessionUser } from "#server/utils/campaign";
import { listEmails, setPrimaryEmail } from "#server/utils/emails";

/**
 * Promote a linked secondary email to primary. The old primary stays linked
 * as a secondary (and remains a valid sign-in email).
 */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const { email } = await readBody<{ email?: string }>(event);
  if (!email?.trim()) {
    throw createError({ statusCode: 400, statusMessage: "请填写邮箱" });
  }
  try {
    await setPrimaryEmail(user.id, email);
  } catch (e) {
    throw createError({
      statusCode: 400,
      statusMessage: (e as Error).message || "设置失败",
    });
  }
  return { ok: true, emails: await listEmails(user.id) };
});
