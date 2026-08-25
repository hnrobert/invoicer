import { In } from "typeorm";
import { AppDataSource } from "./database";
import { Campaign } from "#server/entities/campaign.entity";
import { CampaignTitle } from "#server/entities/campaignTitle.entity";
import { InvoiceTitle } from "#server/entities/invoiceTitle.entity";
import type { AllowedTitle } from "./match";
import type { InvoiceTitlePublic } from "#shared/types";

/**
 * A campaign's allowed invoice titles = its legacy expectedTitle/expectedTaxId
 * pair (the original single-title model, kept as-is for back-compat) plus
 * every stored title attached via campaign_titles. Matching accepts ANY entry.
 */
export async function allowedPairs(
  campaign: Campaign,
): Promise<AllowedTitle[]> {
  const out: AllowedTitle[] = [];
  if (campaign.expectedTitle || campaign.expectedTaxId)
    out.push({
      title: campaign.expectedTitle,
      taxId: campaign.expectedTaxId,
    });
  const edges = await AppDataSource.getRepository(CampaignTitle).find({
    where: { campaignId: campaign.id },
  });
  const ids = edges.map((e) => e.titleId);
  const titles = ids.length
    ? await AppDataSource.getRepository(InvoiceTitle).find({
        where: { id: In(ids) },
      })
    : [];
  for (const t of titles) out.push({ title: t.title, taxId: t.taxId || null });
  return out;
}

/** The campaign's attached stored titles (full fields, for the client). */
export async function campaignTitleRows(
  campaignId: number,
): Promise<InvoiceTitlePublic[]> {
  const edges = await AppDataSource.getRepository(CampaignTitle).find({
    where: { campaignId },
  });
  const ids = edges.map((e) => e.titleId);
  const titles = ids.length
    ? await AppDataSource.getRepository(InvoiceTitle).findBy({ id: In(ids) })
    : [];
  return titles.map((t) => ({
    id: t.id,
    ownerType: t.ownerType,
    ownerId: t.ownerId,
    title: t.title,
    taxId: t.taxId,
    bankName: t.bankName,
    bankAccount: t.bankAccount,
    address: t.address,
    phone: t.phone,
  }));
}

/**
 * Validate + persist a campaign's title selection. Each id must be usable by
 * the caller for this campaign: a personal title they own, an org title of
 * the campaign's org (any member — the org's titles are shared), or a
 * site-managed title. Legacy title/tax_id remain the "custom" first pair.
 */
export async function saveCampaignTitles(
  campaignId: number,
  organizationId: string | null,
  callerId: string,
  titleIds: number[],
): Promise<void> {
  const repo = AppDataSource.getRepository(CampaignTitle);
  await repo.delete({ campaignId });
  if (!titleIds.length) return;
  const titles = await AppDataSource.getRepository(InvoiceTitle).findBy({
    id: In(titleIds),
  });
  const seen = new Set<number>();
  for (const t of titles) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    const usable =
      (t.ownerType === "user" && t.ownerId === callerId) ||
      (t.ownerType === "org" &&
        !!organizationId &&
        t.ownerId === organizationId) ||
      t.ownerType === "site";
    if (!usable)
      throw createError({
        statusCode: 403,
        statusMessage: `Title not usable: ${t.title || t.id}`,
      });
    await repo.save({ campaignId, titleId: t.id });
  }
}
