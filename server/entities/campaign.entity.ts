import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * A reimbursement campaign: the buyer title + tax id every uploaded invoice is
 * checked against, scoped to an owner (personal) or an organization. Replaces
 * the unscoped `ReviewSession`. `userId`/`organizationId` are plain text FKs
 * into Better Auth's `user`/`organization` tables (no TypeORM relation — same
 * convention as the rest of this project). `organizationId` is null for a
 * personal campaign owned solely by `userId`.
 */
@Entity({ name: "campaigns" })
@Index("idx_campaigns_user", ["userId"])
@Index("idx_campaigns_org", ["organizationId"])
export class Campaign {
  @PrimaryGeneratedColumn("increment", {
    type: "integer",
    primaryKeyConstraintName: "pk_campaigns",
  })
  id!: number;

  /** The user who created the campaign (always set). */
  @Column({ name: "user_id", type: "text", nullable: false })
  userId!: string;

  /** Owning organization, or NULL for a personal campaign. */
  @Column({ name: "organization_id", type: "text", nullable: true })
  organizationId!: string | null;

  /** Human label for the campaign list (e.g. "August team trip"). Defaults to the expected title. */
  @Column({ type: "text", nullable: false, default: "" })
  name!: string;

  /** Invoice title (buyer name) to match against. */
  @Column({ name: "expected_title", type: "text", nullable: false })
  expectedTitle!: string;

  /** Unified social credit code / tax id to match against (exact). */
  @Column({ name: "expected_tax_id", type: "text", nullable: true })
  expectedTaxId!: string | null;

  // ── GitHub-like open-platform fields ──────────────────────────────────
  /** Who can see the campaign: public (anyone) / internal (org) / private (privileged). */
  @Column({ type: "text", nullable: false, default: "internal" })
  visibility!: "public" | "internal" | "private";

  /** public + searchable → listed on the explore plaza & in search; else link-only. */
  @Column({ type: "boolean", nullable: false, default: false })
  searchable!: boolean;

  /** Lifecycle: active (uploads open) / closed (read-only) / archived (hidden). */
  @Column({ type: "text", nullable: false, default: "active" })
  status!: "active" | "closed" | "archived";

  /** Optional upload deadline; when reached the campaign behaves as closed. */
  @Column({ name: "deadline", type: "datetime", nullable: true })
  deadline!: Date | null;

  /**
   * Migration flag: until an org admin confirms the campaign's visibility in
   * the migration panel, the campaign keeps the pre-platform access semantics
   * (any org member: view-all / upload / review) — byte-identical to the old
   * behavior. Personal campaigns are always owner-only, so the flag is
   * irrelevant (treated as confirmed).
   */
  @Column({
    name: "visibility_confirmed",
    type: "boolean",
    nullable: false,
    default: false,
  })
  visibilityConfirmed!: boolean;

  @Column({
    name: "created_at",
    type: "datetime",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt!: Date;
}
