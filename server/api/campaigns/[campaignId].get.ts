import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import { requireCampaignAccess, usesSubmitFlow } from "#server/utils/campaign";
import { calcTotal, invoiceToPublic } from "#server/utils/serialize";

/**
 * List a campaign's invoices with a running total and a "still processing"
 * flag. Scoped by the caller's rights: privileged viewers (org Editor+,
 * campaign manager, legacy-mode members) see ALL invoices + the campaign
 * total; everyone else (plain members / collaborators / public link visitors)
 * sees only their own uploads + their own subtotal. `flow` tells the client
 * which review model applies (direct vs submit/approve).
 */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { user, campaign, rights } = await requireCampaignAccess(event, campaignId);

  const seeAll = rights.canViewAll;
  const flow = usesSubmitFlow(campaign) ? "submit" : "direct";
  const invoices = await AppDataSource.getRepository(Invoice).find({
    where: seeAll ? { campaignId } : { campaignId, uploaderId: user.id },
    order: { id: "asc" },
  });

  return {
    ok: true,
    name: campaign.name,
    expected_title: campaign.expectedTitle,
    expected_tax_id: campaign.expectedTaxId,
    organization_id: campaign.organizationId,
    visibility: campaign.visibility,
    status: campaign.status,
    rights,
    flow,
    scoped_to_me: !seeAll,
    invoices: invoices.map(invoiceToPublic),
    total_amount: await calcTotal(campaignId, {
      flow,
      uploaderId: seeAll ? undefined : user.id,
    }),
    has_pending: invoices.some(
      (i) => i.status === "pending" || i.status === "processing",
    ),
  };
});
