import { AppDataSource } from "#server/utils/database";
import { InvoiceTitle } from "#server/entities/invoiceTitle.entity";
import { getSessionUser, getOrgRole } from "#server/utils/campaign";
import { isSuperAdmin } from "#server/utils/superadmin";

/** Update a stored title — same ownership rules as creation. */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const id = Number(getRouterParam(event, "id"));
  const repo = AppDataSource.getRepository(InvoiceTitle);
  const t = await repo.findOneBy({ id });
  if (!t) throw createError({ statusCode: 404, statusMessage: "Not found" });
  const allowed =
    (t.ownerType === "user" && t.ownerId === user.id) ||
    (t.ownerType === "site" && (await isSuperAdmin(user.id))) ||
    (t.ownerType === "org" &&
      ["owner", "admin"].includes(
        (await getOrgRole(t.ownerId, user.id)) ?? "",
      ));
  if (!allowed)
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });

  const b = await readBody<Record<string, string>>(event);
  for (const k of [
    "title",
    "taxId",
    "bankName",
    "bankAccount",
    "address",
    "phone",
  ] as const)
    if (typeof b?.[k] === "string") t[k] = b[k]!.trim();
  await repo.save(t);
  return { ok: true };
});
