import { AppDataSource } from "./database";
import { OrgCustomRole } from "#server/entities/orgCustomRole.entity";
import { authDb } from "./auth";

/**
 * Atomic org permissions — custom roles are POSITION-style named bundles of
 * these, each freely toggleable (built-in roles are fixed presets of the
 * same keys). Campaign-level keys mirror CampaignRights; org-level keys gate
 * the org-settings surfaces.
 */
export const PERMISSIONS = [
  "campaign.create",
  "campaign.upload",
  "campaign.viewAll",
  "campaign.review",
  "campaign.export",
  "campaign.manage",
  "org.member.manage",
  "org.role.manage",
  "org.title.manage",
  "org.visibility.manage",
  "org.transfer.accept",
  "org.audit.view",
] as const;
export type OrgPermission = (typeof PERMISSIONS)[number];

/** Built-in presets (the seven tiers) expressed as permission bundles. */
const PRESETS: Record<string, OrgPermission[]> = {
  owner: [...PERMISSIONS],
  admin: [...PERMISSIONS],
  editor: [
    "campaign.create",
    "campaign.upload",
    "campaign.viewAll",
    "campaign.review",
    "campaign.export",
  ],
  reviewer: [], // group-scoped review only — handled separately
  supervisor: ["campaign.viewAll", "campaign.export"],
  viewer: ["campaign.viewAll"],
  member: ["campaign.create", "campaign.upload"],
};

export function parsePermissions(json: string): Set<OrgPermission> {
  try {
    const arr = JSON.parse(json) as unknown;
    return new Set(
      Array.isArray(arr)
        ? arr.filter((x): x is OrgPermission =>
            (PERMISSIONS as readonly string[]).includes(String(x)),
          )
        : [],
    );
  } catch {
    return new Set();
  }
}

export function isBuiltInRole(role: string): boolean {
  return [
    "owner",
    "admin",
    "editor",
    "reviewer",
    "supervisor",
    "viewer",
    "member",
  ].includes(role);
}

/**
 * The member's effective permission set: built-in role → preset; custom role
 * name → the role's stored bundle; unknown → member preset.
 */
export async function getOrgPermissions(
  organizationId: string,
  userId: string,
): Promise<Set<OrgPermission>> {
  const row = authDb
    .prepare("SELECT role FROM member WHERE organizationId = ? AND userId = ?")
    .get(organizationId, userId) as { role: string } | undefined;
  if (!row) return new Set();
  if (isBuiltInRole(row.role)) return new Set(PRESETS[row.role]);
  const custom = await AppDataSource.getRepository(OrgCustomRole).findOneBy({
    organizationId,
    name: row.role,
  });
  return custom
    ? parsePermissions(custom.permissions)
    : new Set(PRESETS.member);
}

/** A custom role's stored bundle by role NAME (null for built-ins/absent). */
export async function getCustomRolePermissions(
  organizationId: string,
  roleName: string,
): Promise<Set<OrgPermission> | null> {
  if (isBuiltInRole(roleName)) return null;
  const custom = await AppDataSource.getRepository(OrgCustomRole).findOneBy({
    organizationId,
    name: roleName,
  });
  return custom ? parsePermissions(custom.permissions) : null;
}
