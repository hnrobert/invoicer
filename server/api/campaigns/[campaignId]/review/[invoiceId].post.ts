import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import { requireCampaignAccess } from "#server/utils/campaign";
import { calcTotal, invoiceToPublic } from "#server/utils/serialize";

/**
 * Manual review of a "review"-status invoice. The operator decides qualified /
 * unqualified, optionally entering a manual amount when none was recognized.
 * Requires review rights (org Editor+, the campaign manager, or legacy-mode
 * access).
 */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const invoiceId = Number(getRouterParam(event, "invoiceId"));
  const { rights } = await requireCampaignAccess(event, campaignId);
  if (!rights.canReview) {
    throw createError({ statusCode: 403, statusMessage: "无审核权限" });
  }

  const body = await readBody<{
    decision?: string;
    manual_amount?: number | string;
  }>(event);

  if (body?.decision !== "qualified" && body?.decision !== "unqualified") {
    throw createError({
      statusCode: 400,
      statusMessage: "decision 必须为 qualified 或 unqualified",
    });
  }

  const repo = AppDataSource.getRepository(Invoice);
  const inv = await repo.findOneBy({ id: invoiceId, campaignId });
  if (!inv)
    throw createError({ statusCode: 404, statusMessage: "发票记录不存在" });

  let manualAmount = inv.manualAmount;
  if (body.manual_amount != null && body.manual_amount !== "") {
    const n = Number(body.manual_amount);
    if (Number.isNaN(n))
      throw createError({ statusCode: 400, statusMessage: "手动金额格式错误" });
    manualAmount = n;
  }

  const decision = body.decision;
  await repo.update(
    { id: invoiceId },
    {
      status: decision,
      reason: decision === "qualified" ? "手动审核：合格" : "手动审核：不合格",
      amountInTotal: decision === "qualified",
      manualAmount,
    },
  );

  const updated = (await repo.findOneBy({ id: invoiceId }))!;
  return {
    ok: true,
    record: invoiceToPublic(updated),
    total_amount: await calcTotal(campaignId),
  };
});
