// API layer: parse the request, delegate to server/service.
import { getSessionUser } from "#server/utils/campaign";
import { createTitle } from "#server/service/titles/titles";
import type { TitleCreateBody } from "#shared/api";

/** POST /api/titles — create a stored title (user/org/site ownership). */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const body = await readBody<TitleCreateBody>(event);
  return createTitle(user, body ?? {});
});
