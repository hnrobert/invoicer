import { In } from "typeorm";
import { AppDataSource } from "#server/utils/database";
import { CampaignGroup } from "#server/entities/campaignGroup.entity";
import { GroupReviewer } from "#server/entities/groupReviewer.entity";
import { Invoice } from "#server/entities/invoice.entity";
import type { Campaign } from "#server/entities/campaign.entity";
import { sqlAll, sqlGet } from "#server/utils/auth";
import { logAudit } from "#server/utils/audit";
import { notify } from "#server/utils/notify";
import type {
  AssignGroupBody,
  EmailBody,
  GroupCreateBody,
  GroupCreateResponse,
  GroupsResponse,
  OkResponse,
} from "#shared/api";
import type { AuthUser, CampaignRights } from "#shared/types";

function requireManage(rights: CampaignRights): void {
  if (!rights.canManage) {
    throw createError({ statusCode: 403, statusMessage: "Managers only" });
  }
}

/** List the campaign's groups with their reviewer assignments. */
export async function listGroups(campaignId: number): Promise<GroupsResponse> {
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
}

/** Create a group (manager only). */
export async function createGroup(
  user: Pick<AuthUser, "id">,
  campaign: Campaign,
  rights: CampaignRights,
  name: GroupCreateBody["name"],
): Promise<GroupCreateResponse> {
  const campaignId = campaign.id;
  requireManage(rights);
  const n = (name ?? "").trim().slice(0, 40);
  if (!n) {
    throw createError({ statusCode: 400, statusMessage: "Name is required" });
  }
  const dup = await AppDataSource.getRepository(CampaignGroup).findOneBy({
    campaignId,
    name: n,
  });
  if (dup) {
    throw createError({ statusCode: 400, statusMessage: "Name exists" });
  }
  const g = await AppDataSource.getRepository(CampaignGroup).save({
    campaignId,
    name: n,
  });
  logAudit({
    organizationId: campaign.organizationId,
    campaignId,
    actorId: user.id,
    action: "campaign.group.create",
    target: n,
  });
  return { ok: true, group: { id: g.id, name: g.name } };
}

/** Delete a group: its invoices become ungrouped, assignments removed. */
export async function deleteGroup(
  user: Pick<AuthUser, "id">,
  campaign: Campaign,
  rights: CampaignRights,
  groupId: number,
): Promise<OkResponse> {
  const campaignId = campaign.id;
  requireManage(rights);
  const repo = AppDataSource.getRepository(CampaignGroup);
  const g = await repo.findOneBy({ id: groupId, campaignId });
  if (!g) throw createError({ statusCode: 404, statusMessage: "Not found" });
  await AppDataSource.getRepository(Invoice).update(
    { groupId },
    { groupId: null },
  );
  await AppDataSource.getRepository(GroupReviewer).delete({ groupId });
  await repo.delete({ id: groupId });
  logAudit({
    organizationId: campaign.organizationId,
    campaignId,
    actorId: user.id,
    action: "campaign.group.delete",
    target: g.name,
  });
  return { ok: true };
}

/** Assign a reviewer to a group by email (manager only). */
export async function addGroupReviewer(
  user: Pick<AuthUser, "id">,
  campaign: Campaign,
  rights: CampaignRights,
  groupId: number,
  email: EmailBody["email"],
): Promise<OkResponse> {
  const campaignId = campaign.id;
  requireManage(rights);
  const group = await AppDataSource.getRepository(CampaignGroup).findOneBy({
    id: groupId,
    campaignId,
  });
  if (!group) {
    throw createError({ statusCode: 404, statusMessage: "Group not found" });
  }
  const u = await sqlGet<{ id: string; name: string; email: string }>(
    'SELECT id, name, email FROM "user" WHERE lower(email) = $1',
    [(email ?? "").trim().toLowerCase()],
  );
  if (!u) {
    throw createError({ statusCode: 404, statusMessage: "User not found" });
  }
  const repo = AppDataSource.getRepository(GroupReviewer);
  if (await repo.findOneBy({ groupId, userId: u.id })) {
    throw createError({ statusCode: 400, statusMessage: "Already assigned" });
  }
  await repo.save({ groupId, userId: u.id });
  logAudit({
    organizationId: campaign.organizationId,
    campaignId,
    actorId: user.id,
    action: "campaign.group.reviewer.add",
    target: `${group.name}: ${u.email}`,
  });
  notify(u.id, "group.assigned", {
    link: `/orgs/undefined/campaigns/${campaignId}`,
    data: {
      group: group.name,
      campaign: campaign.name || campaign.expectedTitle,
    },
  });
  return { ok: true };
}

/** Remove a reviewer from a group (manager only). */
export async function removeGroupReviewer(
  user: Pick<AuthUser, "id">,
  campaign: Campaign,
  rights: CampaignRights,
  groupId: number,
  userId: string,
): Promise<OkResponse> {
  const campaignId = campaign.id;
  requireManage(rights);
  const group = await AppDataSource.getRepository(CampaignGroup).findOneBy({
    id: groupId,
    campaignId,
  });
  if (!group) {
    throw createError({ statusCode: 404, statusMessage: "Group not found" });
  }
  await AppDataSource.getRepository(GroupReviewer).delete({ groupId, userId });
  logAudit({
    organizationId: campaign.organizationId,
    campaignId,
    actorId: user.id,
    action: "campaign.group.reviewer.remove",
    target: `${group.name}: ${userId}`,
  });
  return { ok: true };
}

/**
 * Assign invoices to a group (or ungroup with groupId: null). Manager only;
 * every invoice must belong to this campaign and the group (when given) too.
 */
export async function assignInvoicesToGroup(
  rights: CampaignRights,
  campaignId: number,
  body: AssignGroupBody,
): Promise<OkResponse> {
  requireManage(rights);
  const ids = (body?.invoiceIds ?? []).filter((n) => Number.isFinite(n));
  if (!ids.length) {
    throw createError({ statusCode: 400, statusMessage: "No invoices given" });
  }
  const gid = body?.groupId == null ? null : Number(body.groupId);
  if (gid != null) {
    const g = await AppDataSource.getRepository(CampaignGroup).findOneBy({
      id: gid,
      campaignId,
    });
    if (!g) {
      throw createError({ statusCode: 404, statusMessage: "Group not found" });
    }
  }
  await AppDataSource.getRepository(Invoice).update(
    { id: In(ids), campaignId },
    { groupId: gid },
  );
  return { ok: true };
}
