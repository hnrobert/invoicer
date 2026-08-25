import { AppDataSource } from "#server/utils/database";
import { InvoiceTitle } from "#server/entities/invoiceTitle.entity";
import { getSessionUser, getOrgRole } from "#server/utils/campaign";
import type { InvoiceTitlePublic } from "#shared/types";

const toPublic = (t: InvoiceTitle): InvoiceTitlePublic => ({
  id: t.id,
  ownerType: t.ownerType,
  ownerId: t.ownerId,
  title: t.title,
  taxId: t.taxId,
  bankName: t.bankName,
  bankAccount: t.bankAccount,
  address: t.address,
  phone: t.phone,
});

/**
 * List stored invoice titles. scope=personal → the caller's own;
 * scope=site → admin-managed (everyone readable); scope=org&orgId=… → that
 * org's (caller must be a member). Default: personal + site + every org the
 * caller belongs to, grouped for the campaign-creation picker.
 */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const q = getQuery(event);
  const repo = AppDataSource.getRepository(InvoiceTitle);

  const orgIds = (await import("#server/utils/campaign")).getUserOrgIds(
    user.id,
  );
  if (q.scope === "personal")
    return {
      ok: true,
      titles: (
        await repo.find({
          where: { ownerType: "user", ownerId: user.id },
          order: { id: "desc" },
        })
      ).map(toPublic),
    };
  if (q.scope === "site")
    return {
      ok: true,
      titles: (
        await repo.find({ where: { ownerType: "site" }, order: { id: "desc" } })
      ).map(toPublic),
    };
  if (q.scope === "org") {
    const orgId = String(q.orgId ?? "");
    if (!orgId || !getOrgRole(orgId, user.id))
      throw createError({
        statusCode: 403,
        statusMessage: "Not an org member",
      });
    return {
      ok: true,
      titles: (
        await repo.find({
          where: { ownerType: "org", ownerId: orgId },
          order: { id: "desc" },
        })
      ).map(toPublic),
    };
  }

  // grouped (campaign picker): personal + site + own orgs
  const all = await repo.find({ order: { id: "desc" } });
  return {
    ok: true,
    personal: all
      .filter((t) => t.ownerType === "user" && t.ownerId === user.id)
      .map(toPublic),
    site: all.filter((t) => t.ownerType === "site").map(toPublic),
    organizations: orgIds.map((oid) => ({
      orgId: oid,
      titles: all
        .filter((t) => t.ownerType === "org" && t.ownerId === oid)
        .map(toPublic),
    })),
  };
});
