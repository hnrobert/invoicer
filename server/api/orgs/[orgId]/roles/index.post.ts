import { AppDataSource } from "#server/utils/database";
import { OrgCustomRole } from "#server/entities/orgCustomRole.entity";
import { getOrgRole, getSessionUser } from "#server/utils/campaign";
import { logAudit } from "#server/utils/audit";

const BASES = ["admin", "editor", "viewer", "member"] as const;

/**
 * Create a custom role (Owner only): a display name bound to a base role.
 * The name is stored verbatim in `member.role` when assigned, so it must not
 * collide with the five built-in role names.
 */
export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, "orgId")!;
  const user = await getSessionUser(event);
  const role = await getOrgRole(orgId, user.id);
  if (role !== "owner") {
    throw createError({ statusCode: 403, statusMessage: "仅 Owner 可管理自定义角色" });
  }
  const body = await readBody<{ name?: string; baseRole?: string }>(event);
  const name = (body?.name ?? "").trim().slice(0, 30);
  const baseRole = body?.baseRole ?? "";
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: "请填写角色名称" });
  }
  if (["owner", "admin", "editor", "viewer", "member"].includes(name)) {
    throw createError({ statusCode: 400, statusMessage: "不能与内置角色重名" });
  }
  if (!(BASES as readonly string[]).includes(baseRole)) {
    throw createError({ statusCode: 400, statusMessage: "baseRole 必须为 admin/editor/viewer/member" });
  }

  const repo = AppDataSource.getRepository(OrgCustomRole);
  const dup = await repo.findOneBy({ organizationId: orgId, name });
  if (dup) {
    throw createError({ statusCode: 400, statusMessage: "该角色名已存在" });
  }
  await repo.save({
    organizationId: orgId,
    name,
    baseRole: baseRole as OrgCustomRole["baseRole"],
  });
  logAudit({
    organizationId: orgId,
    actorId: user.id,
    action: "org.customRole.create",
    target: name,
    meta: { baseRole },
  });
  return { ok: true };
});
