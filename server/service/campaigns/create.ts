import { AppDataSource } from "#server/utils/database";
import { Campaign } from "#server/entities/campaign.entity";
import { isOrgMember } from "#server/utils/campaign";
import { saveCampaignTitles } from "#server/utils/campaignTitles";
import type { CreateCampaignBody, CreateCampaignResponse } from "#shared/api";
import type { AuthUser } from "#shared/types";

/**
 * Create a reimbursement campaign: the expected buyer title + tax id to check
 * every uploaded invoice against. Scoped to the current user (personal) or,
 * when `organization_id` is supplied and the caller is a member of that org,
 * to the organization.
 */
export async function createCampaign(
  user: Pick<AuthUser, "id">,
  body: CreateCampaignBody,
): Promise<CreateCampaignResponse> {
  const title = (body?.title ?? "").trim();
  const taxId = (body?.tax_id ?? "").trim();
  const titleIds = Array.isArray(body?.title_ids)
    ? body.title_ids.filter((n) => Number.isFinite(n))
    : [];
  // Either a custom title/tax pair OR at least one stored title suffices.
  if (!title && !taxId && !titleIds.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "Please provide at least a buyer title or tax ID",
    });
  }

  // An org-scoped campaign requires the caller to be a member of that org.
  let organizationId: string | null = null;
  if (body?.organization_id) {
    if (!(await isOrgMember(body.organization_id, user.id))) {
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
  if (titleIds.length) {
    await saveCampaignTitles(campaign.id, organizationId, user.id, titleIds);
  }
  return { ok: true, campaign_id: campaign.id };
}
