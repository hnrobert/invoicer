// API layer: parse the request, delegate to server/service.
import { getSessionUser } from "#server/utils/campaign";
import { createTitle } from "#server/service/titles/titles";

/** POST /api/titles — create a stored title (user/org/site ownership). */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const b = await readBody<{
    ownerType?: string;
    orgId?: string;
    title?: string;
    taxId?: string;
    bankName?: string;
    bankAccount?: string;
    address?: string;
    phone?: string;
  }>(event);
  const { ownerType, orgId, ...fields } = b ?? {};
  return createTitle(user, ownerType, orgId, fields);
});
