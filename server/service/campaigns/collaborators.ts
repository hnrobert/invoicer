import { AppDataSource } from "#server/utils/database";
import { CampaignCollaborator } from "#server/entities/campaignCollaborator.entity";
import type { Campaign } from "#server/entities/campaign.entity";
import { getOrgRole } from "#server/utils/campaign";
import { sqlAll, sqlGet } from "#server/utils/auth";
import { logAudit } from "#server/utils/audit";
import { notify } from "#server/utils/notify";
import type {
  CollaboratorAddResponse,
  CollaboratorsResponse,
  EmailBody,
  OkResponse,
} from "#shared/api";
import type { AuthUser, CampaignRights } from "#shared/types";

/** List the campaign's collaborators (name/email for display). Manager-visible. */
export async function listCollaborators(
  campaignId: number,
  rights: CampaignRights,
): Promise<CollaboratorsResponse> {
  if (!rights.canManage && !rights.canReview) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }
  const rows = await AppDataSource.getRepository(CampaignCollaborator).find({
    where: { campaignId },
    order: { id: "asc" },
  });
  const ids = rows.map((r) => r.userId);
  const users = ids.length
    ? await sqlAll<{ id: string; name: string; email: string }>(
        `SELECT id, name, email FROM "user" WHERE id IN (${ids.map((_, i) => `$${i + 1}`).join(",")})`,
        ids,
      )
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return {
    ok: true,
    collaborators: rows.map((r) => ({
      userId: r.userId,
      name: byId.get(r.userId)?.name ?? r.userId,
      email: byId.get(r.userId)?.email ?? "",
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/**
 * Add a collaborator to the campaign by email (manager-only). The invitee must
 * be a registered user. Org members may be added too (harmless — the most
 * permissive right wins), but the typical use is inviting org outsiders.
 */
export async function addCollaborator(
  user: Pick<AuthUser, "id" | "name">,
  campaign: Campaign,
  rights: CampaignRights,
  email: EmailBody["email"],
): Promise<CollaboratorAddResponse> {
  const campaignId = campaign.id;
  if (!rights.canManage) {
    throw createError({
      statusCode: 403,
      statusMessage: "Only campaign managers can add collaborators",
    });
  }
  const norm = (email ?? "").trim().toLowerCase();
  if (!norm) {
    throw createError({ statusCode: 400, statusMessage: "Email is required" });
  }
  const u = await sqlGet<{ id: string; name: string; email: string }>(
    'SELECT id, name, email FROM "user" WHERE lower(email) = $1',
    [norm],
  );
  if (!u) {
    throw createError({
      statusCode: 404,
      statusMessage: "No registered user with that email",
    });
  }
  if (
    campaign.organizationId &&
    (await getOrgRole(campaign.organizationId, u.id))
  ) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "This user is already an org member — no collaborator entry needed",
    });
  }

  const repo = AppDataSource.getRepository(CampaignCollaborator);
  const existing = await repo.findOneBy({ campaignId, userId: u.id });
  if (existing) {
    throw createError({
      statusCode: 400,
      statusMessage: "This user is already a collaborator",
    });
  }
  await repo.save({ campaignId, userId: u.id });
  logAudit({
    organizationId: campaign.organizationId,
    campaignId,
    actorId: user.id,
    action: "campaign.collaborator.add",
    target: u.email,
  });
  notify(u.id, "collaborator.added", {
    link: `/?campaign=${campaignId}`,
    data: { campaign: campaign.name || campaign.expectedTitle, by: user.name },
  });
  return {
    ok: true,
    collaborator: { userId: u.id, name: u.name, email: u.email },
  };
}

/** Remove a collaborator (manager-only). */
export async function removeCollaborator(
  user: Pick<AuthUser, "id">,
  campaign: Campaign,
  rights: CampaignRights,
  userId: string,
): Promise<OkResponse> {
  const campaignId = campaign.id;
  if (!rights.canManage) {
    throw createError({
      statusCode: 403,
      statusMessage: "Only campaign managers can remove collaborators",
    });
  }
  await AppDataSource.getRepository(CampaignCollaborator).delete({
    campaignId,
    userId,
  });
  logAudit({
    organizationId: campaign.organizationId,
    campaignId,
    actorId: user.id,
    action: "campaign.collaborator.remove",
    target: userId,
  });
  return { ok: true };
}
