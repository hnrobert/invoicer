import { authDb } from "#server/utils/auth";
import { requireSuperAdmin } from "#server/utils/superadmin";

/** Superadmin: list all registered users (id/name/email/created). */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event);
  const rows = authDb
    .prepare(
      "SELECT id, name, email, emailVerified, createdAt FROM user ORDER BY createdAt DESC LIMIT 500",
    )
    .all() as {
    id: string;
    name: string;
    email: string;
    emailVerified: number;
    createdAt: string;
  }[];
  return {
    ok: true,
    users: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      verified: !!r.emailVerified,
      createdAt: r.createdAt,
    })),
  };
});
