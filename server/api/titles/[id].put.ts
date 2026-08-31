// API layer: parse the request, delegate to server/service.
import { getSessionUser } from "#server/utils/campaign";
import { updateTitle } from "#server/service/titles/titles.service";

/** PUT /api/titles/:id — update a stored title. */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const id = Number(getRouterParam(event, "id"));
  const body = await readBody<Record<string, string>>(event);
  return updateTitle(user, id, body ?? {});
});
