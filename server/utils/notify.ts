import { AppDataSource } from "./database";
import { Notification } from "#server/entities/notification.entity";

/**
 * Push an in-app notification to one user. Fire-and-forget like logAudit —
 * a notification failure must never break the notifying action.
 */
export function notify(
  userId: string,
  type: string,
  opts: { link?: string; data?: Record<string, unknown> } = {},
): void {
  AppDataSource.getRepository(Notification)
    .save({
      userId,
      type,
      link: opts.link ?? "",
      data: JSON.stringify(opts.data ?? {}),
    })
    .catch((e) => console.error("[notify]", e));
}
