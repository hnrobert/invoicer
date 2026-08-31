// API layer: parse the request, delegate to server/service.
import { getSessionUser } from "#server/utils/campaign";
import { markNotificationsRead } from "#server/service/notifications/notifications.service";

/** PUT /api/notifications/read?id= — mark one (or all) notifications read. */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const id = getQuery(event).id ? Number(getQuery(event).id) : null;
  return markNotificationsRead(user, id);
});
