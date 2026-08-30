import { In } from "typeorm";
import { AppDataSource } from "#server/utils/database";
import { CampaignGroup } from "#server/entities/campaignGroup.entity";
import { GroupReviewer } from "#server/entities/groupReviewer.entity";
import { sqlAll } from "#server/utils/auth";
import { requireCampaignAccess } from "#server/utils/campaign";

/** List the campaign's groups with their reviewer assignments. */
export default defineEventHandler(async (event) => {
  const campaignId = Number(getRouterParam(event, "campaignId"));
  await requireCampaignAccess(event, campaignId);

  const groups = await AppDataSource.getRepository(CampaignGroup).find({
    where: { campaignId },
    order: { id: "asc" },
  });
  const ids = groups.map((g) => g.id);
  const assigns = ids.length
    ? await AppDataSource.getRepository(GroupReviewer).find({
        where: { groupId: In(ids) },
      })
    : [];
  const uids = [...new Set(assigns.map((a) => a.userId))];
  const users = uids.length
    ? await sqlAll<{ id: string; name: string; email: string }>(
        `SELECT id, name, email FROM "user" WHERE id IN (${uids.map((_, i) => `$${i + 1}`).join(",")})`,
        uids,
      )
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));

  return {
    ok: true,
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      reviewers: assigns
        .filter((a) => a.groupId === g.id)
        .map((a) => ({
          userId: a.userId,
          name: byId.get(a.userId)?.name ?? a.userId,
          email: byId.get(a.userId)?.email ?? "",
        })),
    })),
  };
});
