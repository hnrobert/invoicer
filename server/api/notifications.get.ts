// API layer: parse the request, delegate to server/service.
import { getSessionUser } from "#server/utils/campaign";
import { listNotifications } from "#server/service/notifications/notifications.service";

/** GET /api/notifications — the caller's notifications + unread count. */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  return listNotifications(user);
});
