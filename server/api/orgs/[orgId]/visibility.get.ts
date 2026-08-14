import { AppDataSource } from "#server/utils/database";
import { OrgSetting } from "#server/entities/orgSetting.entity";
import { getOrgRole, getSessionUser } from "#server/utils/campaign";

/** Read an org's platform visibility (members only; defaults to public). */
export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, "orgId")!;
  const user = await getSessionUser(event);
  if (!(await getOrgRole(orgId, user.id))) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }
  const setting = await AppDataSource.getRepository(OrgSetting).findOneBy({
    organizationId: orgId,
  });
  return { ok: true, visibility: setting?.visibility ?? "public" };
});
