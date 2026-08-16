import type { H3Event } from "h3";
import { authDb } from "./auth";
import { AppDataSource } from "./database";
import { UserEmail } from "#server/entities/userEmail.entity";
import { getSessionUser } from "./campaign";
import type { SessionUser } from "./auth";

/**
 * Superadmin gate for site-wide admin surfaces (mail delivery config, user
 * list). Resolution order:
 *   1. SUPERADMIN_EMAILS env var set (comma/semicolon separated,
 *      case-insensitive, any email linked to the account counts) → membership
 *      by email list.
 *   2. Otherwise → the FIRST registered user is superadmin (bootstrap rule:
 *      whoever signs up first owns the site).
 */
const superadminEmails = () =>
  (process.env.SUPERADMIN_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export async function isSuperAdmin(userId: string): Promise<boolean> {
  const list = superadminEmails();
  if (list.length) {
    const primaries = authDb
      .prepare("SELECT lower(email) AS e FROM user WHERE id = ?")
      .all(userId) as { e: string }[];
    if (primaries.some((r) => list.includes(r.e))) return true;
    const linked = await AppDataSource.getRepository(UserEmail).find({
      where: { userId },
    });
    return linked.some((r) => list.includes(r.email.toLowerCase()));
  }
  // Bootstrap: earliest-created user (rowid as stable tiebreaker) is superadmin.
  const first = authDb
    .prepare("SELECT id FROM user ORDER BY createdAt ASC, rowid ASC LIMIT 1")
    .get() as { id: string } | undefined;
  return !!first && first.id === userId;
}

/** Require a signed-in superadmin; throws 401/403 otherwise. */
export async function requireSuperAdmin(
  event: H3Event,
): Promise<SessionUser> {
  const user = await getSessionUser(event);
  if (!(await isSuperAdmin(user.id))) {
    throw createError({ statusCode: 403, statusMessage: "Superadmin access only" });
  }
  return user;
}
