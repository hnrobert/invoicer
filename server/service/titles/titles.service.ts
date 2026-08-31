import { AppDataSource } from "#server/utils/database";
import { InvoiceTitle } from "#server/entities/invoiceTitle.entity";
import { CampaignTitle } from "#server/entities/campaignTitle.entity";
import { getOrgRole, getUserOrgIds } from "#server/utils/campaign";
import { isSuperAdmin } from "#server/utils/superadmin";
import { logAudit } from "#server/utils/audit";
import type {
  OkResponse,
  TitleCreateBody,
  TitleCreateResponse,
  TitlesGroupedResponse,
  TitlesListResponse,
} from "#shared/api";
import type { AuthUser, InvoiceTitlePublic } from "#shared/types";

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
export async function listTitles(
  user: Pick<AuthUser, "id">,
  scope: string,
  orgIdParam: string,
): Promise<TitlesListResponse | TitlesGroupedResponse> {
  const repo = AppDataSource.getRepository(InvoiceTitle);
  const orgIds = await getUserOrgIds(user.id);

  if (scope === "personal")
    return {
      ok: true as const,
      titles: (
        await repo.find({
          where: { ownerType: "user", ownerId: user.id },
          order: { id: "desc" },
        })
      ).map(toPublic),
    };
  if (scope === "site")
    return {
      ok: true as const,
      titles: (
        await repo.find({ where: { ownerType: "site" }, order: { id: "desc" } })
      ).map(toPublic),
    };
  if (scope === "org") {
    if (!orgIdParam || !(await getOrgRole(orgIdParam, user.id)))
      throw createError({
        statusCode: 403,
        statusMessage: "Not an org member",
      });
    return {
      ok: true as const,
      titles: (
        await repo.find({
          where: { ownerType: "org", ownerId: orgIdParam },
          order: { id: "desc" },
        })
      ).map(toPublic),
    };
  }

  // grouped (campaign picker): personal + site + own orgs
  const all = await repo.find({ order: { id: "desc" } });
  return {
    ok: true as const,
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
}

/**
 * Create a stored invoice title. ownerType 'user' → own personal title;
 * 'org' → caller must be Owner/Admin of orgId; 'site' → superadmin only
 * (visible to everyone at campaign creation).
 */
export async function createTitle(
  user: Pick<AuthUser, "id">,
  body: TitleCreateBody,
): Promise<TitleCreateResponse> {
  const { ownerType, orgId, ...fields } = body;
  const owner =
    ownerType === "org" ? "org" : ownerType === "site" ? "site" : "user";
  if (owner === "org") {
    const role = orgId ? await getOrgRole(orgId, user.id) : null;
    if (role !== "owner" && role !== "admin")
      throw createError({ statusCode: 403, statusMessage: "Owner/Admin only" });
  }
  if (owner === "site" && !(await isSuperAdmin(user.id))) {
    throw createError({ statusCode: 403, statusMessage: "Superadmin only" });
  }

  const title = (fields?.title ?? "").trim();
  const taxId = (fields?.taxId ?? "").trim();
  if (!title && !taxId)
    throw createError({
      statusCode: 400,
      statusMessage: "Title or tax id required",
    });

  const saved = await AppDataSource.getRepository(InvoiceTitle).save({
    ownerType: owner,
    ownerId: owner === "user" ? user.id : owner === "org" ? (orgId ?? "") : "",
    title,
    taxId,
    bankName: (fields?.bankName ?? "").trim(),
    bankAccount: (fields?.bankAccount ?? "").trim(),
    address: (fields?.address ?? "").trim(),
    phone: (fields?.phone ?? "").trim(),
  });
  logAudit({
    actorId: user.id,
    action: "title.create",
    target: title || taxId,
  });
  return { ok: true, id: saved.id };
}

async function loadOwnedTitle(
  user: Pick<AuthUser, "id">,
  id: number,
): Promise<InvoiceTitle> {
  const t = await AppDataSource.getRepository(InvoiceTitle).findOneBy({ id });
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
  return t;
}

/** Update a stored title — same ownership rules as creation. */
export async function updateTitle(
  user: Pick<AuthUser, "id">,
  id: number,
  fields: Record<string, string>,
): Promise<OkResponse> {
  const repo = AppDataSource.getRepository(InvoiceTitle);
  const t = await loadOwnedTitle(user, id);
  for (const k of [
    "title",
    "taxId",
    "bankName",
    "bankAccount",
    "address",
    "phone",
  ] as const)
    if (typeof fields?.[k] === "string") t[k] = fields[k]!.trim();
  await repo.save(t);
  return { ok: true };
}

/** Delete a stored title and detach it from any campaigns using it. */
export async function deleteTitle(
  user: Pick<AuthUser, "id">,
  id: number,
): Promise<OkResponse> {
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
}
