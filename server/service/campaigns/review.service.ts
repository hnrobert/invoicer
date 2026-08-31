import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import type { Campaign } from "#server/entities/campaign.entity";
import { myReviewGroups, usesSubmitFlow } from "#server/utils/campaign";
import { calcTotal, invoiceToPublic } from "#server/utils/serialize";
import { logAudit } from "#server/utils/audit";
import { notify } from "#server/utils/notify";
import type { ReviewBody, ReviewResponse } from "#shared/api";
import type { AuthUser, CampaignRights } from "#shared/types";

/**
 * Manual review of an invoice. Requires review rights (org Editor+, the
 * campaign manager, or legacy-mode access). Two flows:
 *  - direct (legacy / personal): decide qualified/unqualified on a
 *    recognition-status invoice; the qualified flag counts immediately.
 *  - submit (platform model): approve/reject a SUBMITTED invoice — totals
 *    only ever count approvals.
 * The operator may enter a manual amount when none was recognized.
 */
export async function reviewInvoice(
  user: Pick<AuthUser, "id">,
  campaign: Campaign,
  rights: CampaignRights,
  invoiceId: number,
  body: ReviewBody,
): Promise<ReviewResponse> {
  const campaignId = campaign.id;
  // Group reviewers hold no campaign-wide canReview — they may review only
  // invoices inside their assigned groups, checked per invoice.
  let mayReview = rights.canReview;
  if (!mayReview && rights.groupReviewer) {
    const target = await AppDataSource.getRepository(Invoice).findOneBy({
      id: invoiceId,
      campaignId,
    });
    if (target) {
      const groups = await myReviewGroups(campaignId, user.id);
      mayReview = target.groupId != null && groups.includes(target.groupId);
    }
  }
  if (!mayReview) {
    throw createError({
      statusCode: 403,
      statusMessage: "No review permission",
    });
  }

  if (body?.decision !== "qualified" && body?.decision !== "unqualified") {
    throw createError({
      statusCode: 400,
      statusMessage: "decision must be qualified or unqualified",
    });
  }

  const repo = AppDataSource.getRepository(Invoice);
  const inv = await repo.findOneBy({ id: invoiceId, campaignId });
  if (!inv)
    throw createError({
      statusCode: 404,
      statusMessage: "Invoice record not found",
    });

  const submitFlow = usesSubmitFlow(campaign);
  if (submitFlow && inv.reviewState !== "submitted") {
    throw createError({
      statusCode: 400,
      statusMessage:
        "Only submitted invoices can be reviewed (the uploader must submit first)",
    });
  }

  let manualAmount = inv.manualAmount;
  if (body.manual_amount != null && body.manual_amount !== "") {
    const n = Number(body.manual_amount);
    if (Number.isNaN(n))
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid manual amount",
      });
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
          reason:
            decision === "qualified" ? "Review approved" : "Review rejected",
          amountInTotal: decision === "qualified",
          manualAmount,
        }
      : {
          status: decision as "qualified" | "unqualified",
          reason:
            decision === "qualified"
              ? "Manual review: qualified"
              : "Manual review: unqualified",
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
}
