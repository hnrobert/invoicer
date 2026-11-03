import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import type { Campaign } from "#server/entities/campaign.entity";
import { logAudit } from "#server/utils/audit";
import { invoiceToPublic } from "#server/utils/serialize";
import type { InvoicePublic } from "#shared/types";
import type { AuthUser, CampaignRights } from "#shared/types";

/**
 * Manually override (or clear) one file's amount — OCR misreads happen on
 * receipts and quotations too, not just reviewable invoices. Sets
 * `manual_amount`, which takes precedence over the extracted value
 * everywhere (rollups, totals, exports). Same ownership rule as file delete:
 * managers/reviewers any file, everyone else only their own uploads.
 */
export async function setInvoiceAmount(
  user: Pick<AuthUser, "id">,
  campaign: Campaign,
  rights: CampaignRights,
  invoiceId: number,
  amount: number | null,
): Promise<InvoicePublic> {
  const repo = AppDataSource.getRepository(Invoice);
  const row = await repo.findOneBy({
    id: invoiceId,
    campaignId: campaign.id,
  });
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: "File not found" });
  }
  if (!(rights.canManage || rights.canReview) && row.uploaderId !== user.id) {
    throw createError({ statusCode: 403, statusMessage: "Not your upload" });
  }
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid amount" });
  }
  row.manualAmount = amount;
  const saved = await repo.save(row);
  logAudit({
    organizationId: campaign.organizationId,
    campaignId: campaign.id,
    actorId: user.id,
    action: "campaign.invoice.amount",
    target: `${row.filename} → ${amount == null ? "(revert)" : amount}`,
  });
  return invoiceToPublic(saved);
}
