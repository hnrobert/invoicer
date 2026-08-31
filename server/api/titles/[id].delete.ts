// API layer: parse the request, delegate to server/service.
import { getSessionUser } from "#server/utils/campaign";
import { deleteTitle } from "#server/service/titles/titles.service";

/** DELETE /api/titles/:id — delete a stored title. */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const id = Number(getRouterParam(event, "id"));
  return deleteTitle(user, id);
});
