// API layer: parse the request, delegate to server/service.
import { getSessionUser } from "#server/utils/campaign";
import { listTitles } from "#server/service/titles/titles";

/** GET /api/titles — stored titles by scope, or grouped for the picker. */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const q = getQuery(event);
  return listTitles(user, String(q.scope ?? ""), String(q.orgId ?? ""));
});
