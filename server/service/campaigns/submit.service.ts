import { In } from "typeorm";
import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import { invoiceToPublic } from "#server/utils/serialize";
import type { SubmitAllResponse, SubmitResponse } from "#shared/api";
import type { AuthUser, CampaignRights } from "#shared/types";

const TERMINAL = new Set(["qualified", "manual", "unqualified"]);

/**
 * Submit one of the caller's own draft invoices for review (submit/approve
 * flow). Locks the invoice: the uploader can no longer replace it, and the
 * campaign's reviewers see it in their queue. Only terminal recognition
 * results can be submitted — pending/processing/error invoices must finish
 * (or fail) recognition first.
 */
export async function submitInvoice(
  user: Pick<AuthUser, "id">,
  rights: CampaignRights,
  campaignId: number,
  invoiceId: number,
): Promise<SubmitResponse> {
  const repo = AppDataSource.getRepository(Invoice);
  const inv = await repo.findOneBy({ id: invoiceId, campaignId });
  if (!inv)
    throw createError({
      statusCode: 404,
      statusMessage: "Invoice record not found",
    });
  const owns = inv.uploaderId === user.id || rights.canManage;
  if (!owns) {
    throw createError({
      statusCode: 403,
      statusMessage: "You can only submit your own invoices",
    });
  }
  if (inv.reviewState !== "draft") {
    throw createError({
      statusCode: 400,
      statusMessage: "This invoice is not in draft state",
    });
  }
  if (!TERMINAL.has(inv.status)) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "Recognition is not finished (or failed) — cannot submit yet",
    });
  }

  await repo.update(
    { id: invoiceId },
    { reviewState: "submitted", reason: "Submitted — awaiting review" },
  );
  const updated = (await repo.findOneBy({ id: invoiceId }))!;
  return { ok: true, record: invoiceToPublic(updated) };
}

/**
 * Submit every one of the caller's own submittable draft invoices in one go
 * (the "Submit all" button). Same rules as the single-invoice submit; returns
 * the number actually submitted.
 */
export async function submitAllInvoices(
  user: Pick<AuthUser, "id">,
  campaignId: number,
): Promise<SubmitAllResponse> {
  const repo = AppDataSource.getRepository(Invoice);
  const res = await repo.update(
    {
      campaignId,
      uploaderId: user.id,
      reviewState: "draft",
      status: In([...TERMINAL]),
    },
    { reviewState: "submitted", reason: "Submitted — awaiting review" },
  );
  return { ok: true, submitted: res.affected ?? 0 };
}
