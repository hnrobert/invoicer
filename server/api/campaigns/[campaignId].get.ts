import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import { requireCampaignAccess } from "#server/utils/campaign";
import { calcTotal, invoiceToPublic } from "#server/utils/serialize";

/** List all invoices in a campaign with the running total and a "still processing" flag. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { campaign } = await requireCampaignAccess(event, campaignId);

  const invoices = await AppDataSource.getRepository(Invoice).find({
    where: { campaignId },
    order: { id: "asc" },
  });

  return {
    ok: true,
    name: campaign.name,
    expected_title: campaign.expectedTitle,
    expected_tax_id: campaign.expectedTaxId,
    organization_id: campaign.organizationId,
    invoices: invoices.map(invoiceToPublic),
    total_amount: await calcTotal(campaignId),
    has_pending: invoices.some(
      (i) => i.status === "pending" || i.status === "processing",
    ),
  };
});
