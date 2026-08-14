import { unlink } from "node:fs/promises";
import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import { requireCampaignAccess } from "#server/utils/campaign";

/** Remove all uploaded files + records in a campaign, keeping the campaign itself. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  await requireCampaignAccess(event, campaignId);

  const repo = AppDataSource.getRepository(Invoice);
  const rows = await repo.find({ where: { campaignId } });
  for (const r of rows) await unlink(r.savedPath).catch(() => {});
  await repo.delete({ campaignId });
  return { ok: true, msg: "已清除上传文件" };
});
