import { generateRandomString, hashPassword } from "better-auth/crypto";
import { sqlAll, sqlGet, sqlRun } from "#server/utils/auth";
import { AppDataSource } from "#server/utils/database";
import { SiteAdmin } from "#server/entities/siteAdmin.entity";
import { Passkey } from "#server/entities/passkey.entity";
import { isSuperAdmin, superadminEmails } from "#server/utils/superadmin";
import { logAudit } from "#server/utils/audit";
import type {
  AdminGrantBody,
  AdminUserCreateBody,
  AdminUserDetailResponse,
  AdminUserPublic,
  AdminUserUpdateBody,
  OkResponse,
} from "#shared/api";

/** Superadmin: list all registered users (id/name/email/verified/created). */
export async function listUsers(): Promise<AdminUserPublic[]> {
  const rows = await sqlAll<{
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    createdAt: string;
  }>(
    'SELECT id, name, email, "emailVerified", "createdAt" FROM "user" ORDER BY "createdAt" DESC LIMIT 500',
  );
  const admins = new Set(
    (await AppDataSource.getRepository(SiteAdmin).find()).map((a) => a.userId),
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    verified: !!r.emailVerified,
    isSuperAdmin: admins.has(r.id),
    createdAt: r.createdAt,
  }));
}

async function loadUserRow(userId: string) {
  const u = await sqlGet<{
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    createdAt: string;
  }>(
    'SELECT id, name, email, "emailVerified", "createdAt" FROM "user" WHERE id = $1',
    [userId],
  );
  if (!u)
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  return u;
}

/** One user's full profile for the admin detail dialog. */
export async function getUserDetail(
  userId: string,
): Promise<AdminUserDetailResponse> {
  const u = await loadUserRow(userId);
  const [providers, passkeys, orgs, invoiceCount, campaignCount] =
    await Promise.all([
      sqlAll<{ providerId: string }>(
        'SELECT DISTINCT "providerId" FROM account WHERE "userId" = $1',
        [userId],
      ),
      AppDataSource.getRepository(Passkey).find({ where: { userId } }),
      sqlAll<{ id: string; name: string; slug: string; role: string }>(
        'SELECT o.id, o.name, o.slug, m.role FROM member m JOIN organization o ON o.id = m."organizationId" WHERE m."userId" = $1 ORDER BY o.name',
        [userId],
      ),
      sqlGet<{ n: number }>(
        "SELECT count(*)::int AS n FROM invoices WHERE uploader_id = $1",
        [userId],
      ),
      sqlGet<{ n: number }>(
        "SELECT count(*)::int AS n FROM campaigns WHERE user_id = $1",
        [userId],
      ),
    ]);
  const primary = u.email.toLowerCase();
  return {
    ok: true,
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      verified: !!u.emailVerified,
      isSuperAdmin: await isSuperAdmin(userId),
      createdAt: u.createdAt,
    },
    providers: providers.map((p) => p.providerId),
    passkeys: passkeys.map((p) => ({
      id: p.id,
      deviceType: p.deviceType,
      backedUp: p.backedUp,
      createdAt: p.createdAt.toISOString(),
    })),
    organizations: orgs,
    invoiceCount: invoiceCount?.n ?? 0,
    campaignCount: campaignCount?.n ?? 0,
    isEnvAdmin: superadminEmails().includes(primary),
  };
}

/** Admin creates an account with an email+password credential. */
export async function createUser(
  actorId: string,
  body: AdminUserCreateBody,
): Promise<AdminUserPublic> {
  const name = (body?.name ?? "").trim().slice(0, 60);
  const email = (body?.email ?? "").trim().toLowerCase();
  const password = body?.password ?? "";
  if (!name)
    throw createError({ statusCode: 400, statusMessage: "Name is required" });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid email address",
    });
  if (password.length < 8)
    throw createError({
      statusCode: 400,
      statusMessage: "Password must be ≥8 characters",
    });

  const dup = await sqlGet<{ id: string }>(
    'SELECT id FROM "user" WHERE lower(email) = $1',
    [email],
  );
  if (dup)
    throw createError({
      statusCode: 400,
      statusMessage: "Email already registered",
    });

  const id = generateRandomString(32);
  const now = new Date();
  await sqlRun(
    'INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ($1, $2, $3, true, $4, $5)',
    [id, name, email, now, now],
  );
  await sqlRun(
    'INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") VALUES ($1, $2, \'credential\', $3, $4, $5, $6)',
    [generateRandomString(32), id, id, await hashPassword(password), now, now],
  );
  logAudit({
    actorId,
    action: "admin.user.create",
    target: email,
  });
  return {
    id,
    name,
    email,
    verified: true,
    isSuperAdmin: false,
    createdAt: now.toISOString(),
  };
}

/** Edit a user's profile (name / email / emailVerified). */
export async function updateUser(
  actorId: string,
  userId: string,
  body: AdminUserUpdateBody,
): Promise<AdminUserPublic> {
  const u = await loadUserRow(userId);
  const patch: { name?: string; email?: string; emailVerified?: boolean } = {};
  if (typeof body?.name === "string" && body.name.trim())
    patch.name = body.name.trim().slice(0, 60);
  if (typeof body?.email === "string" && body.email.trim()) {
    const email = body.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid email address",
      });
    const dup = await sqlGet<{ id: string }>(
      'SELECT id FROM "user" WHERE lower(email) = $1 AND id <> $2',
      [email, userId],
    );
    if (dup)
      throw createError({
        statusCode: 400,
        statusMessage: "Email already in use",
      });
    patch.email = email;
  }
  if (typeof body?.emailVerified === "boolean")
    patch.emailVerified = body.emailVerified;
  if (Object.keys(patch).length === 0)
    throw createError({
      statusCode: 400,
      statusMessage: "No fields to update",
    });

  if (patch.name !== undefined)
    await sqlRun(
      'UPDATE "user" SET name = $1, "updatedAt" = $2 WHERE id = $3',
      [patch.name, new Date(), userId],
    );
  if (patch.email !== undefined)
    await sqlRun(
      'UPDATE "user" SET email = $1, "updatedAt" = $2 WHERE id = $3',
      [patch.email, new Date(), userId],
    );
  if (patch.emailVerified !== undefined)
    await sqlRun('UPDATE "user" SET "emailVerified" = $1 WHERE id = $2', [
      patch.emailVerified,
      userId,
    ]);
  logAudit({
    actorId,
    action: "admin.user.update",
    target: u.email,
    meta: patch,
  });
  return {
    id: userId,
    name: patch.name ?? u.name,
    email: patch.email ?? u.email,
    verified: patch.emailVerified ?? !!u.emailVerified,
    isSuperAdmin: await isSuperAdmin(userId),
    createdAt: u.createdAt,
  };
}

/** Admin sets a user's password directly (replaces the credential). */
export async function setUserPassword(
  actorId: string,
  userId: string,
  password: string | undefined,
): Promise<OkResponse> {
  const u = await loadUserRow(userId);
  if (!password || password.length < 8)
    throw createError({
      statusCode: 400,
      statusMessage: "Password must be ≥8 characters",
    });
  const hash = await hashPassword(password);
  const existing = await sqlGet<{ id: string }>(
    'SELECT id FROM account WHERE "userId" = $1 AND "providerId" = \'credential\'',
    [userId],
  );
  if (existing) {
    await sqlRun(
      'UPDATE account SET password = $1, "updatedAt" = $2 WHERE id = $3',
      [hash, new Date(), existing.id],
    );
  } else {
    await sqlRun(
      'INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") VALUES ($1, $2, \'credential\', $3, $4, $5, $6)',
      [generateRandomString(32), userId, userId, hash, new Date(), new Date()],
    );
  }
  // Invalidate all sessions — the old credential is compromised from the
  // admin's perspective, force re-login everywhere.
  await sqlRun('DELETE FROM session WHERE "userId" = $1', [userId]);
  logAudit({ actorId, action: "admin.user.password", target: u.email });
  return { ok: true };
}

/**
 * Delete a user and their personal artifacts. Refuses when the user still
 * OWNS an organization (transfer it first) and never allows self-deletion.
 * Historical invoices/campaigns keep their rows; uploads are re-attributed
 * to null (records stay, ownership line dropped).
 */
export async function deleteUser(
  actorId: string,
  userId: string,
): Promise<OkResponse> {
  if (actorId === userId)
    throw createError({
      statusCode: 400,
      statusMessage: "Cannot delete yourself",
    });
  const u = await loadUserRow(userId);
  const owned = await sqlGet<{ n: number }>(
    "SELECT count(*)::int AS n FROM member WHERE \"userId\" = $1 AND role = 'owner'",
    [userId],
  );
  if ((owned?.n ?? 0) > 0)
    throw createError({
      statusCode: 400,
      statusMessage:
        "This user owns an organization — transfer ownership before deleting",
    });

  await sqlRun('DELETE FROM session WHERE "userId" = $1', [userId]);
  await sqlRun('DELETE FROM account WHERE "userId" = $1', [userId]);
  await sqlRun("DELETE FROM passkeys WHERE user_id = $1", [userId]);
  await sqlRun("DELETE FROM user_emails WHERE user_id = $1", [userId]);
  await sqlRun("DELETE FROM notifications WHERE user_id = $1", [userId]);
  await sqlRun("DELETE FROM campaign_collaborators WHERE user_id = $1", [
    userId,
  ]);
  await sqlRun("DELETE FROM group_reviewers WHERE user_id = $1", [userId]);
  await sqlRun('DELETE FROM member WHERE "userId" = $1', [userId]);
  await AppDataSource.getRepository(SiteAdmin).delete({ userId });
  // Campaigns the user created: keep rows (they may hold others' invoices),
  // transfer ownership to the actor so they remain manageable.
  await sqlRun("UPDATE campaigns SET user_id = $1 WHERE user_id = $2", [
    actorId,
    userId,
  ]);
  // Uploaded invoices: keep records + files (campaign totals/history), drop
  // the attribution.
  await sqlRun(
    "UPDATE invoices SET uploader_id = NULL WHERE uploader_id = $1",
    [userId],
  );
  await sqlRun(
    "DELETE FROM audit_logs WHERE actor_id = $1 AND action LIKE 'admin.%'",
    [userId],
  );
  await sqlRun('DELETE FROM "user" WHERE id = $1', [userId]);
  logAudit({ actorId, action: "admin.user.delete", target: u.email });
  return { ok: true };
}

/** Grant/revoke the persistent site_admins table grant (env grants are read-only). */
export async function setSuperAdmin(
  actorId: string,
  userId: string,
  body: AdminGrantBody,
): Promise<OkResponse> {
  await loadUserRow(userId);
  if (actorId === userId && body?.grant === false)
    throw createError({
      statusCode: 400,
      statusMessage: "Cannot revoke your own superadmin",
    });
  const repo = AppDataSource.getRepository(SiteAdmin);
  if (body?.grant) {
    await repo.insert({ userId, source: "granted" }).catch(() => {});
  } else {
    await repo.delete({ userId });
  }
  logAudit({
    actorId,
    action: body?.grant ? "admin.user.grant" : "admin.user.revoke",
    target: userId,
  });
  return { ok: true };
}
