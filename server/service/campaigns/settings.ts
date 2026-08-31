import { AppDataSource } from "#server/utils/database";
import { Campaign } from "#server/entities/campaign.entity";
import { Invoice } from "#server/entities/invoice.entity";
import { logAudit } from "#server/utils/audit";
import { notify } from "#server/utils/notify";
import type { CampaignSettingsResponse, UpdateCampaignBody } from "#shared/api";
import type { AuthUser, CampaignRights } from "#shared/types";

const VISIBILITIES = ["public", "internal", "private"] as const;
const STATUSES = ["active", "closed", "archived"] as const;

/**
 * Update a campaign's platform settings (visibility / searchable / status /
 * deadline / name). Manager-only (org Owner/Admin or the campaign creator) —
 * enforced by the caller via `rights.canManage`. Confirming visibility on a
 * legacy campaign migrates it to the platform model.
 */
export async function updateCampaignSettings(
  user: Pick<AuthUser, "id">,
  campaign: Campaign,
  rights: CampaignRights,
  body: UpdateCampaignBody,
): Promise<CampaignSettingsResponse> {
  const campaignId = campaign.id;
  if (!rights.canManage) {
    throw createError({
      statusCode: 403,
      statusMessage:
        "Only org owners/admins or the campaign manager can change settings",
    });
  }

  const patch: Partial<Campaign> = {};
  if (typeof body?.visibility === "string") {
    if (!(VISIBILITIES as readonly string[]).includes(body.visibility)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid visibility",
      });
    }
    patch.visibility = body.visibility as Campaign["visibility"];
    // Any explicit visibility choice confirms the platform model.
    patch.visibilityConfirmed = true;
  }
  if (typeof body?.searchable === "boolean") {
    if (campaign.visibility !== "public" && body.searchable) {
      throw createError({
        statusCode: 400,
        statusMessage: "Only public campaigns can be searchable",
      });
    }
    patch.searchable = body.searchable;
  }
  if (typeof body?.status === "string") {
    if (!(STATUSES as readonly string[]).includes(body.status)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid campaign status",
      });
    }
    patch.status = body.status as Campaign["status"];
  }
  if (body?.deadline === null || typeof body?.deadline === "string") {
    const d = body.deadline === null ? null : new Date(body.deadline);
    if (d && Number.isNaN(d.getTime())) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid deadline format",
      });
    }
    patch.deadline = d;
  }
  if (typeof body?.name === "string" && body.name.trim()) {
    patch.name = body.name.trim();
  }

  if (Object.keys(patch).length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "No fields to update",
    });
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
}
