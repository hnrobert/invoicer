import { AppDataSource } from "#server/utils/database";
import { InvoiceTitle } from "#server/entities/invoiceTitle.entity";
import { CampaignTitle } from "#server/entities/campaignTitle.entity";
import { getSessionUser, getOrgRole } from "#server/utils/campaign";
import { isSuperAdmin } from "#server/utils/superadmin";

/** Delete a stored title and detach it from any campaigns using it. */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const id = Number(getRouterParam(event, "id"));
  const repo = AppDataSource.getRepository(InvoiceTitle);
  const t = await repo.findOneBy({ id });
  // 404 for others' titles so ownership can't be probed.
  if (!t) throw createError({ statusCode: 404, statusMessage: "Not found" });
  const allowed =
    (t.ownerType === "user" && t.ownerId === user.id) ||
    (t.ownerType === "site" && (await isSuperAdmin(user.id))) ||
    (t.ownerType === "org" &&
      ["owner", "admin"].includes(
        (await getOrgRole(t.ownerId, user.id)) ?? "",
      ));
  if (!allowed)
    throw createError({ statusCode: 404, statusMessage: "Not found" });
  await AppDataSource.getRepository(CampaignTitle).delete({ titleId: id });
  await repo.delete({ id });
  return { ok: true };
});
