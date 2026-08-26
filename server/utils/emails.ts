import { createHash } from "node:crypto";
import { AppDataSource } from "./database";
import { UserEmail } from "#server/entities/userEmail.entity";
import { authDb } from "./auth";

/**
 * Multi-email account management (GitHub-style). The PRIMARY email is Better
 * Auth's `user.email` (no row in user_emails); SECONDARY emails are rows in
 * `user_emails`, globally unique across accounts, stored lowercased. Signing
 * in works with any linked email — see the auth forwarding handler.
 */

export interface AccountEmail {
  email: string;
  primary: boolean;
  /** Secondary emails: verified means control was proven via the emailed code. */
  verified: boolean;
}

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

const norm = (e: string) => e.trim().toLowerCase();

/** Which account (user id) owns this email, if any — primary or secondary. */
export async function findEmailOwner(email: string): Promise<string | null> {
  const e = norm(email);
  const primary = authDb
    .prepare("SELECT id FROM user WHERE lower(email) = ?")
    .get(e) as { id: string } | undefined;
  if (primary) return primary.id;
  const row = await AppDataSource.getRepository(UserEmail).findOneBy({
    email: e,
  });
  return row?.userId ?? null;
}

/**
 * Map a sign-in email to the account's PRIMARY email when it is a linked
 * secondary. Returns null when the email is already a primary (or unknown —
 * let better-auth produce its normal invalid-credentials error).
 */
export async function primaryForLogin(email: string): Promise<string | null> {
  const e = norm(email);
  const isPrimary = authDb
    .prepare("SELECT 1 AS ok FROM user WHERE lower(email) = ?")
    .get(e) as { ok: number } | undefined;
  if (isPrimary) return null;
  const row = await AppDataSource.getRepository(UserEmail).findOneBy({
    email: e,
  });
  // Only VERIFIED secondaries sign in — an unverified link proves nothing.
  if (!row?.verifiedAt) return null;
  const user = authDb
    .prepare("SELECT email FROM user WHERE id = ?")
    .get(row.userId) as { email: string } | undefined;
  return user?.email ?? null;
}

/** All of a user's emails: the primary first, then secondaries (oldest first). */
export async function listEmails(userId: string): Promise<AccountEmail[]> {
  const user = authDb
    .prepare("SELECT email FROM user WHERE id = ?")
    .get(userId) as { email: string } | undefined;
  const rows = await AppDataSource.getRepository(UserEmail).find({
    where: { userId },
    order: { id: "asc" },
  });
  const out: AccountEmail[] = [];
  if (user?.email)
    out.push({ email: user.email, primary: true, verified: true });
  for (const r of rows)
    out.push({ email: r.email, primary: false, verified: !!r.verifiedAt });
  return out;
}

const CODE_TTL_MS = 10 * 60 * 1000; // verification codes live 10 minutes

/**
 * Issue a 6-digit verification code for a linked-but-unverified email.
 * Returns the raw code for the caller to email; only its hash is stored.
 */
export async function issueEmailCode(
  userId: string,
  email: string,
): Promise<string> {
  const code = String(100000 + Math.floor(Math.random() * 900000));
  await AppDataSource.getRepository(UserEmail).update(
    { userId, email },
    {
      codeHash: sha256(code),
      codeExpiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  );
  return code;
}

/** Consume a 6-digit code: mark the email verified. True on success. */
export async function consumeEmailCode(
  userId: string,
  email: string,
  code: string,
): Promise<boolean> {
  const repo = AppDataSource.getRepository(UserEmail);
  const row = await repo.findOneBy({ userId, email });
  if (!row?.codeHash || row.codeHash !== sha256(code.trim())) return false;
  if (!row.codeExpiresAt || row.codeExpiresAt.getTime() < Date.now())
    return false;
  await repo.update(
    { id: row.id },
    { verifiedAt: new Date(), codeHash: null, codeExpiresAt: null },
  );
  return true;
}

/**
 * Link a new secondary email — UNVERIFIED and silent (no email is sent yet;
 * the user triggers the code flow from Settings → Emails). The address only
 * becomes usable (sign-in, promote to primary) after `consumeEmailCode`
 * marks it verified.
 */
export async function addEmail(userId: string, email: string): Promise<void> {
  const e = norm(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
    throw new Error("Invalid email address");
  }
  if (await findEmailOwner(e)) {
    throw new Error("This email is already linked to another account");
  }
  await AppDataSource.getRepository(UserEmail).save({
    userId,
    email: e,
    verifiedAt: null,
  });
}

/** Unlink a secondary email (the primary cannot be removed this way). */
export async function removeEmail(
  userId: string,
  email: string,
): Promise<void> {
  const e = norm(email);
  const user = authDb
    .prepare("SELECT email FROM user WHERE id = ?")
    .get(userId) as { email: string } | undefined;
  if (user?.email?.toLowerCase() === e) {
    throw new Error(
      "The primary email cannot be removed — switch primary first",
    );
  }
  await AppDataSource.getRepository(UserEmail).delete({ userId, email: e });
}

/**
 * Promote a linked secondary email to PRIMARY: Better Auth's `user.email`
 * becomes the new primary, and the old primary is kept as a secondary row so
 * it stays linked (and still signs in).
 */
export async function setPrimaryEmail(
  userId: string,
  email: string,
): Promise<void> {
  const e = norm(email);
  const user = authDb
    .prepare("SELECT email FROM user WHERE id = ?")
    .get(userId) as { email: string } | undefined;
  if (!user) throw new Error("User not found");
  if (user.email.toLowerCase() === e) return; // already primary

  const repo = AppDataSource.getRepository(UserEmail);
  const target = await repo.findOneBy({ userId, email: e });
  if (!target) throw new Error("That email is not linked to this account");
  if (!target.verifiedAt) {
    throw new Error("Verify that email before making it primary");
  }

  const oldPrimary = user.email;
  // The target already proved control — the new primary stays verified.
  authDb
    .prepare("UPDATE user SET email = ?, emailVerified = 1 WHERE id = ?")
    .run(e, userId);
  await repo.remove(target);
  // Keep the old primary linked as a secondary (unless somehow already taken).
  if (!(await findEmailOwner(oldPrimary))) {
    await repo.save({ userId, email: oldPrimary.toLowerCase() });
  }
}
