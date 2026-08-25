import { AppDataSource } from "#server/utils/database";
import { InvoiceTitle } from "#server/entities/invoiceTitle.entity";
import { getSessionUser, getOrgRole } from "#server/utils/campaign";
import { isSuperAdmin } from "#server/utils/superadmin";
import { logAudit } from "#server/utils/audit";

/**
 * Create a stored invoice title. ownerType 'user' → own personal title;
 * 'org' → caller must be Owner/Admin of orgId; 'site' → superadmin only
 * (visible to everyone at campaign creation).
 */
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

  const ownerType =
    b?.ownerType === "org" ? "org" : b?.ownerType === "site" ? "site" : "user";
  if (ownerType === "org") {
    const role = b?.orgId ? await getOrgRole(b.orgId, user.id) : null;
    if (role !== "owner" && role !== "admin")
      throw createError({ statusCode: 403, statusMessage: "Owner/Admin only" });
  }
  if (ownerType === "site" && !(await isSuperAdmin(user.id))) {
    throw createError({ statusCode: 403, statusMessage: "Superadmin only" });
  }

  const title = (b?.title ?? "").trim();
  const taxId = (b?.taxId ?? "").trim();
  if (!title && !taxId)
    throw createError({
      statusCode: 400,
      statusMessage: "Title or tax id required",
    });

  const saved = await AppDataSource.getRepository(InvoiceTitle).save({
    ownerType,
    ownerId:
      ownerType === "user"
        ? user.id
        : ownerType === "org"
          ? (b?.orgId ?? "")
          : "",
    title,
    taxId,
    bankName: (b?.bankName ?? "").trim(),
    bankAccount: (b?.bankAccount ?? "").trim(),
    address: (b?.address ?? "").trim(),
    phone: (b?.phone ?? "").trim(),
  });
  logAudit({
    actorId: user.id,
    action: "title.create",
    target: title || taxId,
  });
  return { ok: true, id: saved.id };
});
