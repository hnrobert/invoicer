import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import { requireCampaignAccess, usesSubmitFlow } from "#server/utils/campaign";
import { calcTotal, invoiceToPublic } from "#server/utils/serialize";
import { logAudit } from "#server/utils/audit";
import { notify } from "#server/utils/notify";

/**
 * Manual review of an invoice. Requires review rights (org Editor+, the
 * campaign manager, or legacy-mode access). Two flows:
 *  - direct (legacy / personal): decide qualified/unqualified on a
 *    recognition-status invoice; the qualified flag counts immediately.
 *  - submit (platform model): approve/reject a SUBMITTED invoice — totals
 *    only ever count approvals.
 * The operator may enter a manual amount when none was recognized.
 */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const invoiceId = Number(getRouterParam(event, "invoiceId"));
  const { user, rights, campaign } = await requireCampaignAccess(event, campaignId);
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

  const submitFlow = usesSubmitFlow(campaign);
  if (submitFlow && inv.reviewState !== "submitted") {
    throw createError({
      statusCode: 400,
      statusMessage: "仅已提交的发票可审核（需上传者先提交）",
    });
  }

  let manualAmount = inv.manualAmount;
  if (body.manual_amount != null && body.manual_amount !== "") {
    const n = Number(body.manual_amount);
    if (Number.isNaN(n))
      throw createError({ statusCode: 400, statusMessage: "手动金额格式错误" });
    manualAmount = n;
  }

  const decision = body.decision;
  logAudit({
    organizationId: campaign.organizationId,
    campaignId,
    actorId: user.id,
    action: "invoice.review",
    target: `invoice #${invoiceId}`,
    meta: { decision, flow: submitFlow ? "submit" : "direct" },
  });
  await repo.update(
    { id: invoiceId },
    submitFlow
      ? {
          // Submit flow: status keeps the recognition outcome; reviewState is
          // the authoritative audit result (totals count approvals only).
          reviewState: decision === "qualified" ? "approved" : "rejected",
          reason: decision === "qualified" ? "审核通过" : "审核驳回",
          amountInTotal: decision === "qualified",
          manualAmount,
        }
      : {
          status: decision,
          reason: decision === "qualified" ? "手动审核：合格" : "手动审核：不合格",
          amountInTotal: decision === "qualified",
          manualAmount,
        },
  );

  const updated = (await repo.findOneBy({ id: invoiceId }))!;
  // Tell the uploader their invoice was decided (skip self-review).
  if (inv.uploaderId && inv.uploaderId !== user.id) {
    notify(inv.uploaderId, "invoice.reviewed", {
      link: `/?campaign=${campaignId}`,
      data: {
        decision,
        filename: inv.filename,
        campaign: campaign.name || campaign.expectedTitle,
      },
    });
  }
  return {
    ok: true,
    record: invoiceToPublic(updated),
    total_amount: await calcTotal(campaignId, {
      flow: submitFlow ? "submit" : "direct",
    }),
  };
});
