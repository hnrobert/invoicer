import { getSessionUser } from "#server/utils/campaign";
import { addEmail, listEmails } from "#server/utils/emails";

/** Link a new secondary email (globally unique across accounts). */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const { email } = await readBody<{ email?: string }>(event);
  if (!email?.trim()) {
    throw createError({ statusCode: 400, statusMessage: "请填写邮箱" });
  }
  try {
    await addEmail(user.id, email);
  } catch (e) {
    throw createError({
      statusCode: 400,
      statusMessage: (e as Error).message || "添加失败",
    });
  }
  return { ok: true, emails: await listEmails(user.id) };
});
