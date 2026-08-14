import { AppDataSource } from "#server/utils/database";
import { Notification } from "#server/entities/notification.entity";
import { getSessionUser } from "#server/utils/campaign";

/**
 * The caller's notifications, newest-first (latest 50). `unread` count is
 * included so the bell badge can render without loading the list.
 */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const repo = AppDataSource.getRepository(Notification);
  const rows = await repo.find({
    where: { userId: user.id },
    order: { id: "desc" },
    take: 50,
  });
  const unread = rows.filter((r) => !r.readAt).length;
  return {
    ok: true,
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
});
