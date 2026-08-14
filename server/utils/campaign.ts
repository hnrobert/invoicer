import type { H3Event } from "h3";
import { auth, authDb } from "./auth";
import { AppDataSource } from "./database";
import { Campaign } from "#server/entities/campaign.entity";
import type { SessionUser } from "./auth";

/**
 * Access control for reimbursement campaigns.
 *
 * A campaign is either **personal** (`organizationId` is null — owned solely by
 * `userId`) or **org-scoped** (owned by `organizationId`). Access rules:
 *   - personal campaign → only `userId` may access it
 *   - org campaign → any member of that organization may access it
 *
 * Org membership is read directly from Better Auth's `member` table
 * (`member(organizationId, userId)`) rather than the "active organization"
 * session concept, so this is robust regardless of which org the client has
 * marked active.
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

/** The set of organization ids the user belongs to. */
export function getUserOrgIds(userId: string): string[] {
  const rows = authDb
    .prepare("SELECT organizationId AS id FROM member WHERE userId = ?")
    .all(userId) as { id: string }[];
  return rows.map((r) => r.id);
}

/**
 * Load a campaign and verify the caller may access it. Throws 404 if the
 * campaign does not exist, 403 if the caller has no claim to it. Returns the
 * verified user + campaign.
 */
export async function requireCampaignAccess(
  event: H3Event,
  campaignId: number,
): Promise<{ user: SessionUser; campaign: Campaign }> {
  const user = await getSessionUser(event);
  const campaign = await AppDataSource.getRepository(Campaign).findOneBy({
    id: campaignId,
  });
  if (!campaign) {
    throw createError({ statusCode: 404, statusMessage: "Campaign not found" });
  }
  const allowed = campaign.organizationId
    ? isOrgMember(campaign.organizationId, user.id)
    : campaign.userId === user.id;
  if (!allowed) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }
  return { user, campaign };
}
