import type { Component } from "vue";

/** A lucide icon by name, or an image URL/data-URI. */
export type IconSpec = { lucide: string } | { img: string };
export type IconRef = string | IconSpec;

/** A component resolved from an IconRef (lucide name) — used by <Icon>. */
export type IconComponent = Component;

/**
 * The authenticated user shape (mirrors Better Auth's default `user` table).
 * Shared by the client (`useState<AuthUser>`) and the `/api/me` response.
 */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Organizations (Better Auth organization plugin) ──────────────────────
// Wire shapes of the /api/auth/organization/* endpoints, shared by the client.

/** Organization membership roles. The six built-in tiers (GitHub-like). */
export type OrgRole =
  | "owner"
  | "admin"
  | "editor"
  | "reviewer"
  | "supervisor"
  | "viewer"
  | "member";

/** A GitHub-style organization a user belongs to or owns. */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  createdAt: string;
  metadata?: unknown;
}

/** A membership row — a user's role within an organization. */
export interface OrgMember {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgRole;
  createdAt: string;
  user: Pick<AuthUser, "id" | "name" | "email" | "image">;
}

/** An organization invitation (pending / accepted / rejected / canceled). */
export interface OrgInvitation {
  id: string;
  organizationId: string;
  organizationName?: string;
  email: string;
  role: OrgRole;
  status: "pending" | "accepted" | "rejected" | "canceled";
  expiresAt: string;
  createdAt: string;
  inviterId: string;
}

/** An organization plus its members + pending invitations (get-full-organization). */
export interface OrgFull extends Organization {
  members: OrgMember[];
  invitations: OrgInvitation[];
}

export type InvoiceStatus =
  | "pending" // queued, not yet processed
  | "processing" // extraction / OCR in progress
  | "qualified" // title + tax id both match → counts toward total
  | "review" // partial match, or amount not recognized → needs a human
  | "unqualified" // neither title nor tax id matches
  | "error"; // extraction failed

/** Two-step review flow state (invoice submission lifecycle). */
export type ReviewState = "draft" | "submitted" | "approved" | "rejected";

export type CampaignVisibility = "public" | "internal" | "private";
export type CampaignStatus = "active" | "closed" | "archived";

/**
 * A reimbursement campaign as seen by the client. `organizationId` is null for a
 * personal campaign owned solely by `userId`, or an org id for an org-scoped one.
 */
export interface CampaignPublic {
  id: number;
  userId: string;
  organizationId: string | null;
  /** Org slug for /orgs/[slug]/campaigns/[id] links (null for personal). */
  orgSlug: string | null;
  name: string;
  expectedTitle: string;
  expectedTaxId: string | null;
  visibility: CampaignVisibility;
  searchable: boolean;
  status: CampaignStatus;
  visibilityConfirmed: boolean;
  createdAt: string;
}

/**
 * The caller's effective rights on a campaign — the most permissive merge of
 * their org role, campaign-manager status (creator), and collaborator grant.
 * `legacy` marks not-yet-migrated org campaigns that keep the pre-platform
 * semantics (every org member: view-all / upload / review).
 */
export interface CampaignRights {
  legacy: boolean;
  /** Org role "reviewer": review/see invoices in ASSIGNED GROUPS only. */
  groupReviewer: boolean;
  canViewCampaign: boolean;
  /** See ALL invoices incl. others'; otherwise only the caller's own. */
  canViewAll: boolean;
  canUpload: boolean;
  canReview: boolean;
  canExport: boolean;
  /** Change campaign settings / manage collaborators. */
  canManage: boolean;
}

export interface InvoicePublic {
  id: number;
  campaignId: number;
  uploaderId: string | null;
  groupId: number | null;
  kind: "invoice" | "receipt";
  extractedMerchant: string | null;
  extractedOrderNo: string | null;
  filename: string;
  fileType: "pdf" | "image" | "xml" | "ofd";
  status: InvoiceStatus;
  reviewState: ReviewState;
  reason: string | null;
  extractedTitle: string | null;
  extractedTaxId: string | null;
  extractedAmount: number | null;
  manualAmount: number | null;
  amountInTotal: boolean;
  error: string | null;
}
