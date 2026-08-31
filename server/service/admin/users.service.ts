import type { AdminUsersResponse } from "#shared/api";
import { sqlAll } from "#server/utils/auth";

/** Superadmin: list all registered users (id/name/email/verified/created). */
export async function listUsers(): Promise<AdminUsersResponse> {
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
    ok: true,
    users: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      verified: !!r.emailVerified,
      createdAt: r.createdAt,
    })),
  };
}
