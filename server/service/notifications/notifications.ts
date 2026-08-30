import { IsNull } from "typeorm";
import { AppDataSource } from "#server/utils/database";
import { Notification } from "#server/entities/notification.entity";
import type { AuthUser } from "#shared/types";

/**
 * The caller's notifications, newest-first (latest 50). `unread` count is
 * included so the bell badge can render without loading the list.
 */
export async function listNotifications(user: Pick<AuthUser, "id">) {
  const rows = await AppDataSource.getRepository(Notification).find({
    where: { userId: user.id },
    order: { id: "desc" },
    take: 50,
  });
  const unread = rows.filter((r) => !r.readAt).length;
  return {
    ok: true as const,
    unread,
    notifications: rows.map((r) => ({
      id: r.id,
      type: r.type,
      link: r.link,
      data: JSON.parse(r.data) as Record<string, unknown>,
      read: !!r.readAt,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/** Mark notifications read: one by id, or all unread when id is null. */
export async function markNotificationsRead(
  user: Pick<AuthUser, "id">,
  id: number | null,
) {
  const repo = AppDataSource.getRepository(Notification);
  await repo.update(
    id ? { id, userId: user.id } : { userId: user.id, readAt: IsNull() },
    { readAt: new Date() },
  );
  return { ok: true as const };
}
