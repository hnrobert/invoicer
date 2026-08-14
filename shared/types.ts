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

/** Organization membership roles (Better Auth defaults). */
export type OrgRole = "owner" | "admin" | "member";

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
  role: "owner" | "admin" | "member";
  createdAt: string;
  user: Pick<AuthUser, "id" | "name" | "email" | "image">;
}

/** An organization invitation (pending / accepted / rejected / canceled). */
export interface OrgInvitation {
  id: string;
  organizationId: string;
  organizationName?: string;
  email: string;
  role: "owner" | "admin" | "member";
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

/**
 * A reimbursement campaign as seen by the client. `organizationId` is null for a
 * personal campaign owned solely by `userId`, or an org id for an org-scoped one.
 */
export interface CampaignPublic {
  id: number;
  userId: string;
  organizationId: string | null;
  name: string;
  expectedTitle: string;
  expectedTaxId: string | null;
  createdAt: string;
}

export interface InvoicePublic {
  id: number;
  campaignId: number;
  filename: string;
  fileType: "pdf" | "image";
  status: InvoiceStatus;
  reason: string | null;
  extractedTitle: string | null;
  extractedTaxId: string | null;
  extractedAmount: number | null;
  manualAmount: number | null;
  amountInTotal: boolean;
  error: string | null;
}
