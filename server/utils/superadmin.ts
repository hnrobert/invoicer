import type { H3Event } from "h3";
import { sqlAll, sqlGet } from "./auth";
import { AppDataSource } from "./database";
import { SiteAdmin } from "#server/entities/siteAdmin.entity";
import { UserEmail } from "#server/entities/userEmail.entity";
import { getSessionUser } from "./campaign";
import type { SessionUser } from "./auth";

/**
 * Superadmin gate for site-wide admin surfaces (mail delivery config, user
 * list). Grants are PERSISTED in the `site_admins` table:
 *   - Bootstrap: the FIRST registered user is granted once, at registration
 *     time (see ensureBootstrapAdmin — decided the moment the site gets its
 *     first account, never re-derived from timestamps afterwards).
 *   - SUPERADMIN_EMAILS env entries (any linked email counts) are checked at
 *     runtime IN ADDITION to the table — useful for recovery/ops.
 */
const superadminEmails = () =>
  (process.env.SUPERADMIN_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

/**
 * Grant the site's first registered user exactly once. The INSERT is guarded
 * by the table's primary key, so concurrent first-checks collapse into a
 * single row and later calls are no-ops. Must run after at least one user
 * exists (returns silently otherwise).
 */
let bootstrapChecked = false;
export async function ensureBootstrapAdmin(): Promise<void> {
  if (bootstrapChecked) return;
  const repo = AppDataSource.getRepository(SiteAdmin);
  const existing = await repo.count();
  if (existing > 0) {
    bootstrapChecked = true;
    return;
  }
  const first = await sqlGet<{ id: string }>(
    'SELECT id FROM "user" ORDER BY "createdAt" ASC, ctid ASC LIMIT 1',
  );
  if (first) {
    await repo
      .insert({ userId: first.id, source: "bootstrap" })
      .catch(() => {}); // unique violation = another concurrent insert won
    console.log("[auth] first registered user granted superadmin");
  }
  bootstrapChecked = true;
}

export async function isSuperAdmin(userId: string): Promise<boolean> {
  // Table grant (persistent).
  const inTable = await AppDataSource.getRepository(SiteAdmin).findOneBy({
    userId,
  });
  if (inTable) return true;

  // Env grants (runtime), matched against any linked email.
  const list = superadminEmails();
  if (list.length) {
    const primaries = await sqlAll<{ e: string }>(
      'SELECT lower(email) AS e FROM "user" WHERE id = $1',
      [userId],
    );
    if (primaries.some((r) => list.includes(r.e))) return true;
    const linked = await AppDataSource.getRepository(UserEmail).find({
      where: { userId },
    });
    if (linked.some((r) => list.includes(r.email.toLowerCase()))) return true;
  }

  // Bootstrap on first evaluation: an empty grants table means nobody has
  // been decided yet — grant the first registrant now.
  await ensureBootstrapAdmin();
  const granted = await AppDataSource.getRepository(SiteAdmin).findOneBy({
    userId,
  });
  return !!granted;
}

/** Require a signed-in superadmin; throws 401/403 otherwise. */
export async function requireSuperAdmin(event: H3Event): Promise<SessionUser> {
  const user = await getSessionUser(event);
  if (!(await isSuperAdmin(user.id))) {
    throw createError({
      statusCode: 403,
      statusMessage: "Superadmin access only",
    });
  }
  return user;
}
