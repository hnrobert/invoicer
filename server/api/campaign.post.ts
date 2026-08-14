import { AppDataSource } from "#server/utils/database";
import { Campaign } from "#server/entities/campaign.entity";
import { getSessionUser, isOrgMember } from "#server/utils/campaign";

/**
 * Create a reimbursement campaign: the expected buyer title + tax id to check
 * every uploaded invoice against. Scoped to the current user (personal) or, when
 * `organization_id` is supplied and the caller is a member of that org, to the
 * organization. The client's "active organization" drives which scope is used.
 */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const body = await readBody<{
    title?: string;
    tax_id?: string;
    organization_id?: string;
    name?: string;
  }>(event);

  const title = (body?.title ?? "").trim();
  const taxId = (body?.tax_id ?? "").trim();
  if (!title && !taxId) {
    throw createError({
      statusCode: 400,
      statusMessage: "请至少填写发票抬头或税号",
    });
  }

  // An org-scoped campaign requires the caller to be a member of that org.
  let organizationId: string | null = null;
  if (body?.organization_id) {
    if (!isOrgMember(body.organization_id, user.id)) {
      throw createError({ statusCode: 403, statusMessage: "Forbidden" });
    }
    organizationId = body.organization_id;
  }

  const name = (body?.name ?? "").trim();
  const campaign = await AppDataSource.getRepository(Campaign).save({
    userId: user.id,
    organizationId,
    name: name || title,
    expectedTitle: title,
    expectedTaxId: taxId || null,
    // New campaigns run the platform model immediately (internal by default;
    // the creator is its manager). Pre-existing unconfirmed campaigns keep the
    // legacy semantics until the migration panel confirms them.
    visibility: "internal",
    visibilityConfirmed: true,
  });
  return { ok: true, campaign_id: campaign.id };
});
