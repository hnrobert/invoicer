import { AppDataSource } from "#server/utils/database";
import { Campaign } from "#server/entities/campaign.entity";
import { Invoice } from "#server/entities/invoice.entity";
import { requireCampaignAccess } from "#server/utils/campaign";
import { logAudit } from "#server/utils/audit";
import { notify } from "#server/utils/notify";

const VISIBILITIES = ["public", "internal", "private"] as const;
const STATUSES = ["active", "closed", "archived"] as const;

/**
 * Update a campaign's platform settings (visibility / searchable / status /
 * deadline / name). Manager-only (org Owner/Admin or the campaign creator).
 * Confirming visibility on a legacy campaign migrates it to the platform
 * model — the caller must hold canManage (legacy: owner/admin only).
 */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { user, campaign, rights } = await requireCampaignAccess(event, campaignId);
  if (!rights.canManage) {
    throw createError({ statusCode: 403, statusMessage: "仅组织管理者/活动创建者可修改设置" });
  }
  const body = await readBody<{
    visibility?: string;
    searchable?: boolean;
    status?: string;
    deadline?: string | null;
    name?: string;
  }>(event);

  const patch: Partial<Campaign> = {};
  if (typeof body?.visibility === "string") {
    if (!(VISIBILITIES as readonly string[]).includes(body.visibility)) {
      throw createError({ statusCode: 400, statusMessage: "无效的可见性" });
    }
    patch.visibility = body.visibility as Campaign["visibility"];
    // Any explicit visibility choice confirms the platform model.
    patch.visibilityConfirmed = true;
  }
  if (typeof body?.searchable === "boolean") {
    if (campaign.visibility !== "public" && body.searchable) {
      throw createError({
        statusCode: 400,
        statusMessage: "仅 public 活动可设置可搜索",
      });
    }
    patch.searchable = body.searchable;
  }
  if (typeof body?.status === "string") {
    if (!(STATUSES as readonly string[]).includes(body.status)) {
      throw createError({ statusCode: 400, statusMessage: "无效的活动状态" });
    }
    patch.status = body.status as Campaign["status"];
  }
  if (body?.deadline === null || typeof body?.deadline === "string") {
    const d = body.deadline === null ? null : new Date(body.deadline);
    if (d && Number.isNaN(d.getTime())) {
      throw createError({ statusCode: 400, statusMessage: "截止时间格式错误" });
    }
    patch.deadline = d;
  }
  if (typeof body?.name === "string" && body.name.trim()) {
    patch.name = body.name.trim();
  }

  if (Object.keys(patch).length === 0) {
    throw createError({ statusCode: 400, statusMessage: "没有需要更新的字段" });
  }
  logAudit({
    organizationId: campaign.organizationId,
    campaignId,
    actorId: user.id,
    action: "campaign.update",
    target: `campaign #${campaignId}`,
    meta: {
      ...patch,
      deadline: patch.deadline?.toISOString() ?? null,
    },
  });
  // A status / visibility change affects everyone who uploaded — notify the
  // distinct uploaders (managers excluded; they made the change).
  if (patch.status && patch.status !== campaign.status) {
    const uploaders = await AppDataSource.getRepository(Invoice)
      .createQueryBuilder("inv")
      .select("DISTINCT inv.uploader_id", "uid")
      .where("inv.campaign_id = :id", { id: campaignId })
      .getRawMany<{ uid: string }>();
    for (const { uid } of uploaders) {
      if (uid && uid !== user.id) {
        notify(uid, "campaign.status", {
          link: `/?campaign=${campaignId}`,
          data: {
            status: patch.status,
            campaign: campaign.name || campaign.expectedTitle,
          },
        });
      }
    }
  }

  const saved = await AppDataSource.getRepository(Campaign).save({
    ...campaign,
    ...patch,
  });
  return {
    ok: true,
    campaign: {
      id: saved.id,
      visibility: saved.visibility,
      searchable: saved.searchable,
      status: saved.status,
      deadline: saved.deadline?.toISOString() ?? null,
      name: saved.name,
      visibilityConfirmed: saved.visibilityConfirmed,
    },
  };
});
