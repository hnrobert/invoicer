import { In } from "typeorm";
import { AppDataSource } from "#server/utils/database";
import { OrgSetting } from "#server/entities/orgSetting.entity";
import { CampaignTransfer } from "#server/entities/campaignTransfer.entity";
import { Campaign } from "#server/entities/campaign.entity";
import { getOrgRole } from "#server/utils/campaign";
import { sqlGet } from "#server/utils/auth";
import type {
  OrgSignatureBody,
  OrgSignatureResponse,
  OrgTransfersResponse,
  OrgVisibilityBody,
  VisibilityResponse,
} from "#shared/api";

/** Read an org's platform visibility (members only; defaults to public). */
export async function getOrgVisibility(
  orgId: string,
  userId: string,
): Promise<VisibilityResponse> {
  if (!(await getOrgRole(orgId, userId))) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }
  const setting = await AppDataSource.getRepository(OrgSetting).findOneBy({
    organizationId: orgId,
  });
  return { ok: true, visibility: setting?.visibility ?? "public" };
}

/**
 * Set an organization's platform visibility (public / private). Owner or
 * Admin only. Private orgs keep their campaigns off the explore plaza; their
 * public campaigns stay reachable by direct link.
 */
export async function setOrgVisibility(
  orgId: string,
  userId: string,
  visibility: OrgVisibilityBody["visibility"],
): Promise<VisibilityResponse> {
  const role = await getOrgRole(orgId, userId);
  if (role !== "owner" && role !== "admin") {
    throw createError({
      statusCode: 403,
      statusMessage: "Only Owner/Admin can change organization visibility",
    });
  }
  if (visibility !== "public" && visibility !== "private") {
    throw createError({
      statusCode: 400,
      statusMessage: "visibility must be public or private",
    });
  }

  const repo = AppDataSource.getRepository(OrgSetting);
  const existing = await repo.findOneBy({ organizationId: orgId });
  const saved = await repo.save({
    ...(existing ?? { organizationId: orgId }),
    visibility,
  });
  return { ok: true, visibility: saved.visibility };
}

/** Read the org's head-of-org signature data URL (members). */
export async function getOrgSignature(
  orgId: string,
  userId: string,
): Promise<OrgSignatureResponse> {
  if (!(await getOrgRole(orgId, userId))) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }
  const setting = await AppDataSource.getRepository(OrgSetting).findOneBy({
    organizationId: orgId,
  });
  return { ok: true, data: setting?.signature ?? null };
}

/**
 * Set / clear the head-of-org signature stamped into the claim-form export's
 * "Head of Organization/Society" cell. Owner/Admin only. Accepts a data URL
 * (png/jpeg, ≤1 MB decoded — signatures are small) or null to remove.
 */
export async function setOrgSignature(
  orgId: string,
  userId: string,
  data: OrgSignatureBody["data"],
): Promise<OrgSignatureResponse> {
  const role = await getOrgRole(orgId, userId);
  if (role !== "owner" && role !== "admin") {
    throw createError({
      statusCode: 403,
      statusMessage: "Only Owner/Admin can change the signature",
    });
  }
  let value: string | null = null;
  if (data != null) {
    const m = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)$/.exec(data);
    if (!m) {
      throw createError({
        statusCode: 400,
        statusMessage: "signature must be a base64 png/jpeg data URL",
      });
    }
    if (m[2]!.length > 1_400_000) {
      throw createError({
        statusCode: 400,
        statusMessage: "signature image too large (max ~1 MB)",
      });
    }
    value = data;
  }
  const repo = AppDataSource.getRepository(OrgSetting);
  const existing = await repo.findOneBy({ organizationId: orgId });
  await repo.save({
    ...(existing ?? { organizationId: orgId }),
    signature: value,
  });
  return { ok: true, data: value };
}

/**
 * Pending transfers TO one org (for the accept/reject UI) plus outgoing
 * pending ones FROM it. Owner/Admin only.
 */
export async function listOrgTransfers(
  orgId: string,
  userId: string,
): Promise<OrgTransfersResponse> {
  const role = await getOrgRole(orgId, userId);
  if (role !== "owner" && role !== "admin") {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }
  const rows = (
    await AppDataSource.getRepository(CampaignTransfer).find({
      where: [{ toOrganizationId: orgId }, { fromOrganizationId: orgId }],
      order: { id: "desc" },
      take: 100,
    })
  ).filter((r) => r.status === "pending");

  const campaignIds = [...new Set(rows.map((r) => r.campaignId))];
  const campaigns = campaignIds.length
    ? await AppDataSource.getRepository(Campaign).find({
        where: { id: In(campaignIds) },
      })
    : [];
  const campaignName = new Map(
    campaigns.map((c) => [c.id, c.name || c.expectedTitle]),
  );
  const orgIds = [
    ...new Set(rows.flatMap((r) => [r.fromOrganizationId, r.toOrganizationId])),
  ];
  const orgNames = new Map(orgIds.map((id) => [id, id])); // fallback: the id
  await Promise.all(
    orgIds.map(async (id) => {
      const row = await sqlGet<{ name: string }>(
        "SELECT name FROM organization WHERE id = $1",
        [id],
      );
      if (row) orgNames.set(id, row.name);
    }),
  );

  return {
    ok: true,
    transfers: rows.map((r) => ({
      id: r.id,
      campaignId: r.campaignId,
      campaign: campaignName.get(r.campaignId) ?? `#${r.campaignId}`,
      incoming: r.toOrganizationId === orgId,
      fromOrg: orgNames.get(r.fromOrganizationId) ?? r.fromOrganizationId,
      toOrg: orgNames.get(r.toOrganizationId) ?? r.toOrganizationId,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
