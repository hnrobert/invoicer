import type { H3Event } from "h3";
import { auth, authDb } from "./auth";
import { AppDataSource } from "./database";
import { Campaign } from "#server/entities/campaign.entity";
import { CampaignCollaborator } from "#server/entities/campaignCollaborator.entity";
import { OrgCustomRole } from "#server/entities/orgCustomRole.entity";
import type { SessionUser } from "./auth";
import type { CampaignRights, OrgRole } from "#shared/types";

/**
 * Access control for reimbursement campaigns (GitHub-like platform model).
 *
 * A campaign is either **personal** (`organizationId` is null — owned solely by
 * `userId`) or **org-scoped**. Effective rights are the MOST PERMISSIVE merge of:
 *   1. the caller's org role — owner/admin (everything + manage), editor
 *      (review/export/view-all), viewer (view-all only), member (upload own),
 *   2. campaign manager — the creator (`campaign.userId`) can review/export
 *      their campaign regardless of a low org role,
 *   3. collaborator — a direct participant grant on the campaign (upload own).
 *
 * Visibility gates who can even reach a campaign: public (any logged-in user,
 * upload via link), internal (org members + collaborators), private (org
 * Owner/Admin/Editor + manager + collaborators). Archived campaigns are hidden
 * from everyone but privileged viewers.
 *
 * Migration: org campaigns with `visibilityConfirmed = false` keep the
 * pre-platform semantics — every org member gets view-all/upload/review,
 * exactly like the old code — until an admin confirms the visibility in the
 * migration panel. Personal campaigns are always owner-only (flag irrelevant).
 *
 * Org membership/roles are read directly from Better Auth's `member` table
 * rather than the "active organization" session concept, so this is robust
 * regardless of which org the client has marked active.
 */

/**
 * Require a signed-in user; throws 401 otherwise. Returns the session user.
 *
 * We pass only a plain `Headers` object (built via `getHeaders`) rather than
 * `toWebRequest(event).headers`: `toWebRequest` materializes a web `Request`
 * bound to the event's body stream, and better-auth's getSession path drains
 * that body — which makes any *later* `readBody`/`readMultipartFormData` on the
 * same event hang forever. A plain Headers object gives better-auth the cookies
 * it needs without touching the body, so callers may read the body before or
 * after this call freely.
 */
export async function getSessionUser(event: H3Event): Promise<SessionUser> {
  const session = await auth.api.getSession({
    headers: new Headers(getHeaders(event) as Record<string, string>),
  });
  if (!session?.user) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }
  return session.user;
}

/** True if `userId` is a member of `organizationId` (any role). */
export function isOrgMember(
  organizationId: string,
  userId: string,
): boolean {
  const row = authDb
    .prepare(
      "SELECT 1 AS ok FROM member WHERE organizationId = ? AND userId = ?",
    )
    .get(organizationId, userId) as { ok: number } | undefined;
  return !!row;
}

/**
 * The user's organization role, normalized to the five built-in tiers. A
 * custom role name (org_custom_roles) resolves to its base role's rights;
 * unknown values degrade to plain member. Async because custom roles live in
 * the TypeORM tables.
 */
export async function getOrgRole(
  organizationId: string,
  userId: string,
): Promise<OrgRole | null> {
  const row = authDb
    .prepare(
      "SELECT role FROM member WHERE organizationId = ? AND userId = ?",
    )
    .get(organizationId, userId) as { role: string } | undefined;
  if (!row) return null;
  switch (row.role) {
    case "owner":
    case "admin":
    case "editor":
    case "viewer":
    case "member":
      return row.role;
    default:
      break;
  }
  // Custom role name → its base role.
  const custom = await AppDataSource.getRepository(OrgCustomRole).findOneBy({
    organizationId,
    name: row.role,
  });
  if (custom) return custom.baseRole;
  return "member";
}

/** The set of organization ids the user belongs to. */
export function getUserOrgIds(userId: string): string[] {
  const rows = authDb
    .prepare("SELECT organizationId AS id FROM member WHERE userId = ?")
    .all(userId) as { id: string }[];
  return rows.map((r) => r.id);
}

/** True if `userId` is a collaborator on the campaign. */
export async function isCollaborator(
  campaignId: number,
  userId: string,
): Promise<boolean> {
  const row = await AppDataSource.getRepository(CampaignCollaborator).findOneBy(
    { campaignId, userId },
  );
  return !!row;
}

const NO_ACCESS: CampaignRights = {
  legacy: false,
  canViewCampaign: false,
  canViewAll: false,
  canUpload: false,
  canReview: false,
  canExport: false,
  canManage: false,
};

/**
 * Resolve the caller's effective rights on a campaign (no visibility check —
 * this assumes the caller may already see it; `campaignReachable` decides that).
 */
export async function resolveCampaignRights(
  user: SessionUser,
  campaign: Campaign,
): Promise<CampaignRights> {
  // Personal campaign: the owner runs everything.
  if (!campaign.organizationId) {
    return campaign.userId === user.id
      ? {
          ...NO_ACCESS,
          legacy: false,
          canViewCampaign: true,
          canViewAll: true,
          canUpload: true,
          canReview: true,
          canExport: true,
          canManage: true,
        }
      : NO_ACCESS;
  }

  const role = await getOrgRole(campaign.organizationId, user.id);
  const collaborator = await isCollaborator(campaign.id, user.id);
  const isManager = campaign.userId === user.id;

  // Migration grace: unconfirmed org campaigns keep the old semantics — every
  // org member could view-all / upload / review.
  if (!campaign.visibilityConfirmed) {
    if (!role && !collaborator) return NO_ACCESS;
    const manage = role === "owner" || role === "admin";
    return {
      legacy: true,
      canViewCampaign: true,
      canViewAll: true,
      canUpload: true,
      canReview: true,
      canExport: false, // export did not exist pre-platform
      canManage: manage,
    };
  }

  // New platform model.
  if (!role && !collaborator && campaign.visibility !== "public") return NO_ACCESS;

  const uploadOpen = campaign.status === "active";
  const r: CampaignRights = { ...NO_ACCESS, legacy: false, canViewCampaign: true };

  switch (role) {
    case "owner":
    case "admin":
      Object.assign(r, {
        canViewAll: true,
        canUpload: uploadOpen,
        canReview: true,
        canExport: true,
        canManage: true,
      });
      break;
    case "editor":
      Object.assign(r, {
        canViewAll: true,
        canUpload: uploadOpen,
        canReview: true,
        canExport: true,
      });
      break;
    case "viewer":
      Object.assign(r, { canViewAll: true }); // read-only: no export, no upload
      break;
    case "member":
      Object.assign(r, { canUpload: uploadOpen });
      if (isManager) {
        // The member created this campaign → its manager (review/export here).
        Object.assign(r, { canViewAll: true, canReview: true, canExport: true });
      }
      break;
    default:
      break; // non-member: public campaigns only — upload own via link
  }

  if (role == null) {
    // Non-member on a public campaign (link access), or a collaborator on an
    // internal/private one: participate with their own invoices only.
    r.canUpload = uploadOpen;
  }
  return r;
}

/**
 * Whether the campaign runs the two-step review flow (upload → submit →
 * approve). Only confirmed org campaigns do; personal campaigns and unconfirmed
 * (legacy) ones keep the direct review flow the current UI implements.
 */
export function usesSubmitFlow(campaign: Campaign): boolean {
  return !!campaign.organizationId && campaign.visibilityConfirmed;
}

/**
 * Whether the campaign is hidden entirely (archived campaigns stay visible to
 * privileged viewers only).
 */
function effectivelyArchived(campaign: Campaign): boolean {
  return campaign.status === "archived";
}

/**
 * Load a campaign and verify the caller may access it. Throws 404 if the
 * campaign does not exist, 403 if the caller has no claim to it. Returns the
 * verified user, campaign, and the caller's effective rights. Callers gate
 * further actions (upload / review / export) on the returned rights.
 */
export async function requireCampaignAccess(
  event: H3Event,
  campaignId: number,
): Promise<{ user: SessionUser; campaign: Campaign; rights: CampaignRights }> {
  const user = await getSessionUser(event);
  const campaign = await AppDataSource.getRepository(Campaign).findOneBy({
    id: campaignId,
  });
  if (!campaign) {
    throw createError({ statusCode: 404, statusMessage: "Campaign not found" });
  }
  const rights = await resolveCampaignRights(user, campaign);
  const hidden =
    effectivelyArchived(campaign) &&
    !(rights.canReview || rights.canManage || rights.legacy);
  if (!rights.canViewCampaign || hidden) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }
  return { user, campaign, rights };
}
