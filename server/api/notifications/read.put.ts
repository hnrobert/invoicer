import { IsNull } from "typeorm";
import { AppDataSource } from "#server/utils/database";
import { Notification } from "#server/entities/notification.entity";
import { getSessionUser } from "#server/utils/campaign";

/** Mark notifications read: `?id=` one, or all unread when omitted. */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const id = getQuery(event).id ? Number(getQuery(event).id) : null;
  const repo = AppDataSource.getRepository(Notification);
  await repo.update(
    id ? { id, userId: user.id } : { userId: user.id, readAt: IsNull() },
    { readAt: new Date() },
  );
  return { ok: true };
});
