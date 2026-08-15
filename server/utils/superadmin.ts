import type { H3Event } from "h3";
import { authDb } from "./auth";
import { AppDataSource } from "./database";
import { UserEmail } from "#server/entities/userEmail.entity";
import { getSessionUser } from "./campaign";
import type { SessionUser } from "./auth";

/**
 * Superadmin gate for site-wide admin surfaces (/admin, mail config, user
 * list). Membership is by email — any email linked to the account (primary or
 * secondary) counts. The list comes from the SUPERADMIN_EMAILS env var
 * (comma/semicolon separated, case-insensitive); empty by default, meaning
 * nobody is superadmin until configured.
 */
const superadminEmails = () =>
  (process.env.SUPERADMIN_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export async function isSuperAdmin(userId: string): Promise<boolean> {
  const list = superadminEmails();
  if (!list.length) return false;
  const primaries = authDb
    .prepare("SELECT lower(email) AS e FROM user WHERE id = ?")
    .all(userId) as { e: string }[];
  if (primaries.some((r) => list.includes(r.e))) return true;
  const linked = await AppDataSource.getRepository(UserEmail).find({
    where: { userId },
  });
  return linked.some((r) => list.includes(r.email.toLowerCase()));
}

/** Require a signed-in superadmin; throws 401/403 otherwise. */
export async function requireSuperAdmin(
  event: H3Event,
): Promise<SessionUser> {
  const user = await getSessionUser(event);
  if (!(await isSuperAdmin(user.id))) {
    throw createError({ statusCode: 403, statusMessage: "仅站点管理员可访问" });
  }
  return user;
}
