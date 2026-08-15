import { getSessionUser } from "#server/utils/campaign";
import { listEmails, removeEmail } from "#server/utils/emails";

/** Unlink a secondary email (the primary cannot be removed — switch first). */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const email = decodeURIComponent(getRouterParam(event, "email") ?? "");
  if (!email) {
    throw createError({ statusCode: 400, statusMessage: "Missing email parameter" });
  }
  try {
    await removeEmail(user.id, email);
  } catch (e) {
    throw createError({
      statusCode: 400,
      statusMessage: (e as Error).message || "Failed to remove",
    });
  }
  return { ok: true, emails: await listEmails(user.id) };
});
