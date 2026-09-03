/**
 * API contract types — the single source of truth for every custom endpoint's
 * request body and response, imported by ALL THREE layers:
 *
 *   server/api/**      readBody<XxxBody>
 *   server/service/**  input params + return annotations
 *   client (pages/composables)  $fetch<XxxResponse>
 *
 * Before this file each layer declared its own inline literal, so the client
 * and server shapes could (and did) drift. Wire shapes for Better Auth's own
 * /api/auth/* endpoints stay in ./types.ts.
 */
import type {
  AuthUser,
  CampaignPublic,
  CampaignRights,
  CampaignStatus,
  CampaignVisibility,
  InvoicePublic,
  InvoiceTitlePublic,
} from "./types";

/** Boilerplate success flag every handler returns. */
export interface OkResponse {
  ok: true;
}

// ── shared element shapes ──────────────────────────────────────────────────

/** A linked account email (Settings → Emails). */
export interface AccountEmail {
  email: string;
  primary: boolean;
  /** Secondary emails: verified means control was proven via the emailed code. */
  verified: boolean;
}

export interface CollaboratorPublic {
  userId: string;
  name: string;
  email: string;
  createdAt?: string;
}

export interface GroupReviewerPublic {
  userId: string;
  name: string;
  email: string;
}

export interface CampaignGroupPublic {
  id: number;
  name: string;
  reviewers: GroupReviewerPublic[];
}

export interface CustomRolePublic {
  name: string;
  baseRole: string;
  permissions: string[];
}

export interface OrgTransferPublic {
  id: number;
  campaignId: number;
  campaign: string;
  incoming: boolean;
  fromOrg: string;
  toOrg: string;
  createdAt: string;
}

export interface AuditLogPublic {
  id: number;
  action: string;
  target: string;
  meta: Record<string, unknown>;
  actorName: string;
  actorEmail: string;
  campaignId: number | null;
  organizationId: string | null;
  createdAt: string;
}

export interface NotificationPublic {
  id: number;
  type: string;
  link: string;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface AdminUserPublic {
  id: string;
  name: string;
  email: string;
  verified: boolean;
  isSuperAdmin: boolean;
  createdAt: string;
}

/** GET /api/admin/users/:id — full profile for the detail dialog. */
export interface AdminUserDetailResponse extends OkResponse {
  user: AdminUserPublic;
  providers: string[];
  passkeys: {
    id: number;
    deviceType: string | null;
    backedUp: boolean;
    createdAt: string;
  }[];
  organizations: { id: string; name: string; slug: string; role: string }[];
  invoiceCount: number;
  campaignCount: number;
  isEnvAdmin: boolean;
}

/** POST /api/admin/users — admin creates an account (email+password login). */
export interface AdminUserCreateBody {
  name?: string;
  email?: string;
  password?: string;
}

/** PUT /api/admin/users/:id */
export interface AdminUserUpdateBody {
  name?: string;
  email?: string;
  emailVerified?: boolean;
}

/** PUT /api/admin/users/:id/password — admin sets a new password. */
export interface AdminPasswordBody {
  password?: string;
}

/** PUT /api/admin/users/:id/superadmin */
export interface AdminGrantBody {
  grant?: boolean;
}

/** Explore plaza card — a campaign plus its org display name. */
export interface ExploreItem extends CampaignPublic {
  orgName: string | null;
}

// ── request bodies ─────────────────────────────────────────────────────────

/** POST /api/campaign */
export interface CreateCampaignBody {
  title?: string;
  tax_id?: string;
  organization_id?: string;
  name?: string;
  title_ids?: number[];
}

/** PUT /api/campaigns/:id */
export interface UpdateCampaignBody {
  visibility?: string;
  searchable?: boolean;
  status?: string;
  deadline?: string | null;
  name?: string;
}

/** POST /api/campaigns/:id/review/:invoiceId */
export interface ReviewBody {
  decision?: string;
  manual_amount?: number | string;
}

/** POST /api/campaigns/:id/invoices/group */
export interface AssignGroupBody {
  invoiceIds?: number[];
  groupId?: number | null;
}

/** POST /api/campaigns/:id/transfer + :id/collaborators + groups… */
export interface EmailBody {
  email?: string;
}

export interface GroupCreateBody {
  name?: string;
}

export interface TransferRequestBody {
  target_org_id?: string;
}

/** POST /api/campaigns/:id/report + /api/mail/test */
export interface RecipientBody {
  to?: string;
}

/** PUT /api/orgs/:orgId/visibility */
export interface OrgVisibilityBody {
  visibility?: string;
}

/** POST /api/orgs/:orgId/roles */
export interface RoleCreateBody {
  name?: string;
  baseRole?: string;
  permissions?: string[];
}

/** PUT /api/orgs/:orgId/roles/:name */
export interface RoleUpdateBody {
  permissions?: string[];
}

/** POST /api/titles — the six stored-title fields + ownership routing. */
export interface TitleCreateBody {
  ownerType?: string;
  orgId?: string;
  title?: string;
  taxId?: string;
  bankName?: string;
  bankAccount?: string;
  address?: string;
  phone?: string;
}

/** POST /api/account/emails/* — the 6-digit code flow. */
export interface VerifyCodeBody {
  email?: string;
  code?: string;
}

// ── responses ──────────────────────────────────────────────────────────────

export interface CreateCampaignResponse extends OkResponse {
  campaign_id: number;
}

/** POST /api/campaigns/:id/transfer */
export interface TransferRequestResponse extends OkResponse {
  transfer_id: number;
}

/** PUT /api/campaigns/:id — the saved settings echo. */
export interface CampaignSettingsResponse extends OkResponse {
  campaign: {
    id: number;
    visibility: CampaignVisibility;
    searchable: boolean;
    status: CampaignStatus;
    deadline: string | null;
    name: string;
    visibilityConfirmed: boolean;
  };
}

export interface CampaignsResponse extends OkResponse {
  personal: CampaignPublic[];
  organizations: CampaignPublic[];
  collaborations: CampaignPublic[];
}

/** GET /api/campaigns/:id — the live campaign workspace payload. */
export interface CampaignDetailResponse extends OkResponse {
  name: string;
  expected_title: string;
  expected_tax_id: string | null;
  organization_id: string | null;
  org_slug: string | null;
  campaign_user_id: string;
  visibility: CampaignVisibility;
  status: CampaignStatus;
  searchable: boolean;
  rights: CampaignRights;
  flow: "direct" | "submit";
  titles: InvoiceTitlePublic[];
  scoped_to_me: boolean;
  invoices: InvoicePublic[];
  my_group_ids: number[];
  total_amount: number;
  has_pending: boolean;
}

export interface UploadResponse extends OkResponse {
  results: InvoicePublic[];
}

export interface ClearResponse extends OkResponse {
  msg: string;
}

export interface ReviewResponse extends OkResponse {
  record: InvoicePublic;
  total_amount: number;
}

export interface SubmitResponse extends OkResponse {
  record: InvoicePublic;
}

export interface SubmitAllResponse extends OkResponse {
  submitted: number;
}

export interface ReportResponse extends OkResponse {
  messageId: string;
  total: number;
  count: number;
  warning?: string;
}

export interface CollaboratorsResponse extends OkResponse {
  collaborators: CollaboratorPublic[];
}

export interface CollaboratorAddResponse extends OkResponse {
  collaborator: Omit<CollaboratorPublic, "createdAt">;
}

export interface GroupsResponse extends OkResponse {
  groups: CampaignGroupPublic[];
}

export interface GroupCreateResponse extends OkResponse {
  group: { id: number; name: string };
}

export interface RolesResponse extends OkResponse {
  roles: CustomRolePublic[];
}

export interface OrgTransfersResponse extends OkResponse {
  transfers: OrgTransferPublic[];
}

export interface VisibilityResponse extends OkResponse {
  visibility: "public" | "private";
}

/** GET /api/titles?scope=personal|site|org */
export interface TitlesListResponse extends OkResponse {
  titles: InvoiceTitlePublic[];
}

/** GET /api/titles (grouped — the campaign-creation picker). */
export interface TitlesGroupedResponse extends OkResponse {
  personal: InvoiceTitlePublic[];
  site: InvoiceTitlePublic[];
  organizations: { orgId: string; titles: InvoiceTitlePublic[] }[];
}

export interface TitleCreateResponse extends OkResponse {
  id: number;
}

export interface AuditResponse extends OkResponse {
  logs: AuditLogPublic[];
}

export interface ExploreResponse extends OkResponse {
  campaigns: ExploreItem[];
}

export interface NotificationsResponse extends OkResponse {
  unread: number;
  notifications: NotificationPublic[];
}

export interface AdminUsersResponse extends OkResponse {
  users: AdminUserPublic[];
}

export interface EmailsResponse extends OkResponse {
  emails: AccountEmail[];
}

export interface InvoiceTextResponse extends OkResponse {
  filename: string;
  text: string;
}

/** GET /api/me */
export interface MeResponse {
  user: AuthUser | null;
  isAdmin: boolean;
}
