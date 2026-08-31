// API layer: parse the request, delegate to server/service.
import { getSessionUser } from "#server/utils/campaign";
import { acceptTransfer } from "#server/service/transfers/transfers.service";

/** POST /api/transfers/:id/accept — accept a pending transfer. */
export default defineEventHandler(async (event) => {
  const transferId = Number(getRouterParam(event, "transferId"));
  const user = await getSessionUser(event);
  return acceptTransfer(user, transferId);
});
