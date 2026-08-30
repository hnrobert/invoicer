import { AppDataSource } from "#server/utils/database";
import { Campaign } from "#server/entities/campaign.entity";
import { Invoice } from "#server/entities/invoice.entity";
import { myReviewGroups, usesSubmitFlow } from "#server/utils/campaign";
import { sqlGet } from "#server/utils/auth";
import { calcTotal, invoiceToPublic } from "#server/utils/serialize";
import { campaignTitleRows } from "#server/utils/campaignTitles";
import type { AuthUser, CampaignRights } from "#shared/types";

/** Compliant total over a visible row set, honoring the review flow. */
export function visibleTotal(
  rows: {
    amountInTotal: boolean;
    reviewState: string;
    extractedAmount: number | null;
    manualAmount: number | null;
  }[],
  flow: "direct" | "submit",
): number {
  let total = 0;
  for (const r of rows) {
    const counts =
      flow === "submit" ? r.reviewState === "approved" : r.amountInTotal;
    if (!counts) continue;
    const amt = r.extractedAmount ?? r.manualAmount;
    if (amt != null) total += amt;
  }
  return Math.round(total * 100) / 100;
}

/**
 * A campaign's invoice list with a running total and a "still processing"
 * flag. Scoped by the caller's rights: privileged viewers (org Editor+,
 * campaign manager, legacy-mode members) see ALL invoices + the campaign
 * total; everyone else (plain members / collaborators / public link visitors)
 * sees only their own uploads + their own subtotal. `flow` tells the client
 * which review model applies (direct vs submit/approve).
 */
export async function campaignDetail(
  user: Pick<AuthUser, "id">,
  campaign: Campaign,
  rights: CampaignRights,
) {
  const campaignId = campaign.id;
  const flow = usesSubmitFlow(campaign) ? "submit" : "direct";
  // Group reviewers see their own + their assigned groups' invoices.
  const groupIds = rights.groupReviewer
    ? await myReviewGroups(campaignId, user.id)
    : [];
  const seeAll = rights.canViewAll;
  const invoices = seeAll
    ? await AppDataSource.getRepository(Invoice).find({
        where: { campaignId },
        order: { id: "asc" },
      })
    : groupIds.length
      ? (
          await AppDataSource.getRepository(Invoice).find({
            where: { campaignId },
            order: { id: "asc" },
          })
        ).filter(
          (i) =>
            i.uploaderId === user.id ||
            (i.groupId != null && groupIds.includes(i.groupId)),
        )
      : await AppDataSource.getRepository(Invoice).find({
          where: { campaignId, uploaderId: user.id },
          order: { id: "asc" },
        });

  const orgSlug = campaign.organizationId
    ? ((
        await sqlGet<{ slug: string }>(
          "SELECT slug FROM organization WHERE id = $1",
          [campaign.organizationId],
        )
      )?.slug ?? null)
    : null;

  return {
    ok: true as const,
    name: campaign.name,
    expected_title: campaign.expectedTitle,
    expected_tax_id: campaign.expectedTaxId,
    organization_id: campaign.organizationId,
    org_slug: orgSlug,
    campaign_user_id: campaign.userId,
    visibility: campaign.visibility,
    status: campaign.status,
    rights,
    flow,
    titles: await campaignTitleRows(campaignId),
    scoped_to_me: !seeAll,
    invoices: invoices.map(invoiceToPublic),
    // Total over the VISIBLE set (campaign-wide for privileged viewers,
    // own+groups for group reviewers, own for everyone else).
    my_group_ids: groupIds,
    total_amount: seeAll
      ? await calcTotal(campaignId, { flow })
      : visibleTotal(invoices, flow),
    has_pending: invoices.some(
      (i) => i.status === "pending" || i.status === "processing",
    ),
  };
}
