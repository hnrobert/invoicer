import { AppDataSource } from "#server/utils/database";
import { CampaignCollaborator } from "#server/entities/campaignCollaborator.entity";
import { requireCampaignAccess } from "#server/utils/campaign";
import { authDb } from "#server/utils/auth";

/** List the campaign's collaborators (name/email for display). Manager-visible. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  const { rights } = await requireCampaignAccess(event, campaignId);
  if (!rights.canManage && !rights.canReview) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }
  const rows = await AppDataSource.getRepository(CampaignCollaborator).find({
    where: { campaignId },
    order: { id: "asc" },
  });
  const ids = rows.map((r) => r.userId);
  const users = ids.length
    ? (authDb
        .prepare(
          `SELECT id, name, email FROM user WHERE id IN (${ids.map(() => "?").join(",")})`,
        )
        .all(...ids) as { id: string; name: string; email: string }[])
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
});
