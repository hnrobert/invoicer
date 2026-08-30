import { sqlAll } from "#server/utils/auth";

/** Superadmin: list all registered users (id/name/email/verified/created). */
export async function listUsers() {
  const rows = await sqlAll<{
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    createdAt: string;
  }>(
    'SELECT id, name, email, "emailVerified", "createdAt" FROM "user" ORDER BY "createdAt" DESC LIMIT 500',
  );
  return {
    ok: true as const,
    users: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      verified: !!r.emailVerified,
      createdAt: r.createdAt,
    })),
  };
}
