import { In } from "typeorm";
import { AppDataSource } from "#server/utils/database";
import { CampaignGroup } from "#server/entities/campaignGroup.entity";
import { Invoice } from "#server/entities/invoice.entity";
import { requireCampaignAccess } from "#server/utils/campaign";

/**
 * Assign invoices to a group (or ungroup with groupId: null). Manager only;
 * every invoice must belong to this campaign and the group (when given) too.
 */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { rights } = await requireCampaignAccess(event, campaignId);
  if (!rights.canManage) {
    throw createError({ statusCode: 403, statusMessage: "Managers only" });
  }
  const body = await readBody<{
    invoiceIds?: number[];
    groupId?: number | null;
  }>(event);
  const ids = (body?.invoiceIds ?? []).filter((n) => Number.isFinite(n));
  if (!ids.length) {
    throw createError({ statusCode: 400, statusMessage: "No invoices given" });
  }
  const groupId = body?.groupId == null ? null : Number(body.groupId);
  if (groupId != null) {
    const g = await AppDataSource.getRepository(CampaignGroup).findOneBy({
      id: groupId,
      campaignId,
    });
    if (!g) {
      throw createError({ statusCode: 404, statusMessage: "Group not found" });
    }
  }
  await AppDataSource.getRepository(Invoice).update(
    { id: In(ids), campaignId },
    { groupId },
  );
  return { ok: true };
});
