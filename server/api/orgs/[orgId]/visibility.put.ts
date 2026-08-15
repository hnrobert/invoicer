import { AppDataSource } from "#server/utils/database";
import { OrgSetting } from "#server/entities/orgSetting.entity";
import { getOrgRole, getSessionUser } from "#server/utils/campaign";

/**
 * Set an organization's platform visibility (public / private). Owner or Admin
 * only. Private orgs keep their campaigns off the explore plaza; their public
 * campaigns stay reachable by direct link.
 */
export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, "orgId")!;
  const user = await getSessionUser(event);
  const role = await getOrgRole(orgId, user.id);
  if (role !== "owner" && role !== "admin") {
    throw createError({ statusCode: 403, statusMessage: "Only Owner/Admin can change organization visibility" });
  }
  const body = await readBody<{ visibility?: string }>(event);
  if (body?.visibility !== "public" && body?.visibility !== "private") {
    throw createError({ statusCode: 400, statusMessage: "visibility must be public or private" });
  }

  const repo = AppDataSource.getRepository(OrgSetting);
  const existing = await repo.findOneBy({ organizationId: orgId });
  const saved = await repo.save({
    ...(existing ?? { organizationId: orgId }),
    visibility: body.visibility,
  });
  return { ok: true, visibility: saved.visibility };
});
