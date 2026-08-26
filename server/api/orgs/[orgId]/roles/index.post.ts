import { AppDataSource } from "#server/utils/database";
import { OrgCustomRole } from "#server/entities/orgCustomRole.entity";
import { getSessionUser } from "#server/utils/campaign";
import { logAudit } from "#server/utils/audit";
import { getOrgPermissions } from "#server/utils/orgPermissions";

const BASES = [
  "admin",
  "editor",
  "reviewer",
  "supervisor",
  "viewer",
  "member",
] as const;

/**
 * Create a custom role (Owner only): a display name bound to a base role.
 * The name is stored verbatim in `member.role` when assigned, so it must not
 * collide with the five built-in role names.
 */
export default defineEventHandler(async (event) => {
  const orgId = getRouterParam(event, "orgId")!;
  const user = await getSessionUser(event);
  if (!(await getOrgPermissions(orgId, user.id)).has("org.role.manage")) {
    throw createError({
      statusCode: 403,
      statusMessage: "Only the organization owner can manage custom roles",
    });
  }
  const body = await readBody<{
    name?: string;
    baseRole?: string;
    permissions?: string[];
  }>(event);
  const name = (body?.name ?? "").trim().slice(0, 30);
  const baseRole = body?.baseRole ?? "";
  if (!name) {
    throw createError({
      statusCode: 400,
      statusMessage: "Role name is required",
    });
  }
  if (
    [
      "owner",
      "admin",
      "editor",
      "reviewer",
      "supervisor",
      "viewer",
      "member",
    ].includes(name)
  ) {
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
  // Default bundle = the chosen template's preset; an explicit permissions
  // array overrides (position-based, per-permission customization).
  const preset = {
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
  }[baseRole as (typeof BASES)[number]];
  await repo.save({
    organizationId: orgId,
    name,
    baseRole: baseRole as OrgCustomRole["baseRole"],
    permissions: JSON.stringify(perms ?? preset),
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
