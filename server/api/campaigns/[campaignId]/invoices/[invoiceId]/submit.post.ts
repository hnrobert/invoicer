import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import { requireCampaignAccess } from "#server/utils/campaign";
import { invoiceToPublic } from "#server/utils/serialize";

const TERMINAL = new Set(["qualified", "review", "unqualified"]);

/**
 * Submit one of the caller's own draft invoices for review (submit/approve
 * flow). Locks the invoice: the uploader can no longer replace it, and the
 * campaign's reviewers see it in their queue. Only terminal recognition
 * results can be submitted — pending/processing/error invoices must finish
 * (or fail) recognition first.
 */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const invoiceId = Number(getRouterParam(event, "invoiceId"));
  const { user, rights } = await requireCampaignAccess(event, campaignId);

  const repo = AppDataSource.getRepository(Invoice);
  const inv = await repo.findOneBy({ id: invoiceId, campaignId });
  if (!inv)
    throw createError({ statusCode: 404, statusMessage: "发票记录不存在" });
  const owns = inv.uploaderId === user.id || rights.canManage;
  if (!owns) {
    throw createError({ statusCode: 403, statusMessage: "只能提交自己的发票" });
  }
  if (inv.reviewState !== "draft") {
    throw createError({ statusCode: 400, statusMessage: "该发票不在草稿状态" });
  }
  if (!TERMINAL.has(inv.status)) {
    throw createError({
      statusCode: 400,
      statusMessage: "识别未完成（或失败），暂不能提交",
    });
  }

  await repo.update(
    { id: invoiceId },
    { reviewState: "submitted", reason: "已提交，等待审核" },
  );
  const updated = (await repo.findOneBy({ id: invoiceId }))!;
  return { ok: true, record: invoiceToPublic(updated) };
});
