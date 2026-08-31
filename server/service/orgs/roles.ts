import { AppDataSource } from "#server/utils/database";
import { OrgCustomRole } from "#server/entities/orgCustomRole.entity";
import {
  PERMISSIONS,
  getOrgPermissions,
  isBuiltInRole,
} from "#server/utils/orgPermissions";
import { sqlRun } from "#server/utils/auth";
import { logAudit } from "#server/utils/audit";
import type {
  OkResponse,
  RoleCreateBody,
  RoleUpdateBody,
  RolesResponse,
} from "#shared/api";
import type { AuthUser } from "#shared/types";

const BASES = [
  "admin",
  "editor",
  "reviewer",
  "supervisor",
  "viewer",
  "member",
] as const;

/** Permission presets each base role templates onto a newly created role. */
const BASE_PRESETS: Record<(typeof BASES)[number], string[]> = {
  admin: PERMISSIONS.slice(),
  editor: [
    "campaign.create",
    "campaign.upload",
    "campaign.viewAll",
    "campaign.review",
    "campaign.export",
  ],
  reviewer: [],
  supervisor: ["campaign.viewAll", "campaign.export"],
  viewer: ["campaign.viewAll"],
  member: ["campaign.create", "campaign.upload"],
};

async function requireRoleManage(orgId: string, userId: string) {
  if (!(await getOrgPermissions(orgId, userId)).has("org.role.manage")) {
    throw createError({
      statusCode: 403,
      statusMessage: "Only the organization owner can manage custom roles",
    });
  }
}

/** List the org's custom roles (any member may read — assignment UI needs it). */
export async function listRoles(orgId: string): Promise<RolesResponse> {
  const rows = await AppDataSource.getRepository(OrgCustomRole).find({
    where: { organizationId: orgId },
    order: { id: "asc" },
  });
  return {
    ok: true,
    roles: rows.map((r) => ({
      name: r.name,
      baseRole: r.baseRole,
      permissions: JSON.parse(r.permissions || "[]") as string[],
    })),
  };
}

/**
 * Create a custom role (org.role.manage): a display name bound to a base
 * role. The name is stored verbatim in `member.role` when assigned, so it
 * must not collide with the built-in role names.
 */
export async function createRole(
  user: Pick<AuthUser, "id">,
  orgId: string,
  body: RoleCreateBody,
): Promise<OkResponse> {
  await requireRoleManage(orgId, user.id);
  const name = (body?.name ?? "").trim().slice(0, 30);
  const baseRole = body?.baseRole ?? "";
  if (!name) {
    throw createError({
      statusCode: 400,
      statusMessage: "Role name is required",
    });
  }
  if (isBuiltInRole(name)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Cannot reuse a built-in role name",
    });
  }
  if (!(BASES as readonly string[]).includes(baseRole)) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "baseRole must be admin/editor/reviewer/supervisor/viewer/member",
    });
  }

  const repo = AppDataSource.getRepository(OrgCustomRole);
  const dup = await repo.findOneBy({ organizationId: orgId, name });
  if (dup) {
    throw createError({
      statusCode: 400,
      statusMessage: "A role with this name already exists",
    });
  }
  // Explicit permission set (position-based) — defaults to the template
  // preset when omitted so "pick a base role" still works one-shot.
  const perms = Array.isArray(body?.permissions)
    ? body!.permissions.filter((p) =>
        (PERMISSIONS as readonly string[]).includes(p),
      )
    : null;
  await repo.save({
    organizationId: orgId,
    name,
    baseRole: baseRole as OrgCustomRole["baseRole"],
    permissions: JSON.stringify(
      perms ?? BASE_PRESETS[baseRole as (typeof BASES)[number]],
    ),
  });
  logAudit({
    organizationId: orgId,
    actorId: user.id,
    action: "org.customRole.create",
    target: name,
    meta: { baseRole },
  });
  return { ok: true };
}

/** Edit a custom role's permission bundle (org.role.manage). */
export async function updateRolePermissions(
  user: Pick<AuthUser, "id">,
  orgId: string,
  name: string,
  body: RoleUpdateBody,
): Promise<OkResponse> {
  await requireRoleManage(orgId, user.id);
  const repo = AppDataSource.getRepository(OrgCustomRole);
  const existing = await repo.findOneBy({ organizationId: orgId, name });
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: "Role not found" });
  }
  if (!Array.isArray(body?.permissions)) {
    throw createError({
      statusCode: 400,
      statusMessage: "permissions required",
    });
  }
  const clean = body.permissions.filter((p) =>
    (PERMISSIONS as readonly string[]).includes(p),
  );
  await repo.update(
    { organizationId: orgId, name },
    { permissions: JSON.stringify(clean) },
  );
  logAudit({
    organizationId: orgId,
    actorId: user.id,
    action: "org.customRole.update",
    target: name,
    meta: { permissions: clean },
  });
  return { ok: true };
}

/** Delete a custom role; members still holding it are demoted to member. */
export async function deleteRole(
  user: Pick<AuthUser, "id">,
  orgId: string,
  name: string,
): Promise<OkResponse> {
  await requireRoleManage(orgId, user.id);
  await AppDataSource.getRepository(OrgCustomRole).delete({
    organizationId: orgId,
    name,
  });
  // Demote anyone still assigned the deleted name (Better Auth member table).
  await sqlRun(
    "UPDATE member SET role = 'member' WHERE organizationId = $1 AND role = $2",
    [orgId, name],
  );
  logAudit({
    organizationId: orgId,
    actorId: user.id,
    action: "org.customRole.delete",
    target: name,
  });
  return { ok: true };
}
