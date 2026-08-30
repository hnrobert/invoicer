// API layer: parse the request, delegate to server/service.
import { getSessionUser } from "#server/utils/campaign";
import { cancelTransfer } from "#server/service/transfers/transfers";

/** DELETE /api/transfers/:id — cancel/reject a pending transfer. */
export default defineEventHandler(async (event) => {
  const transferId = Number(getRouterParam(event, "transferId"));
  const user = await getSessionUser(event);
  return cancelTransfer(user, transferId);
});
