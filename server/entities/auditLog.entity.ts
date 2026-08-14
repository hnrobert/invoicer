import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * Append-only audit trail for permission-sensitive actions: exports, review
 * decisions, campaign settings changes, collaborator changes. `actorId` is a
 * plain text FK into Better Auth's `user` table; `meta` is a small JSON blob
 * (e.g. export format, review decision) — kept minimal on purpose.
 */
@Entity({ name: "audit_logs" })
@Index("idx_audit_logs_campaign", ["campaignId"])
@Index("idx_audit_logs_org", ["organizationId"])
@Index("idx_audit_logs_created", ["createdAt"])
export class AuditLog {
  @PrimaryGeneratedColumn("increment", {
    type: "integer",
    primaryKeyConstraintName: "pk_audit_logs",
  })
  id!: number;

  @Column({ name: "organization_id", type: "text", nullable: true })
  organizationId!: string | null;

  @Column({ name: "campaign_id", type: "integer", nullable: true })
  campaignId!: number | null;

  @Column({ name: "actor_id", type: "text", nullable: false })
  actorId!: string;

  /** Dotted action key, e.g. 'campaign.export', 'invoice.review'. */
  @Column({ type: "text", nullable: false })
  action!: string;

  /** Human-readable target, e.g. 'invoice #42' or 'collaborator a@b.c'. */
  @Column({ type: "text", nullable: false, default: "" })
  target!: string;

  @Column({ type: "text", nullable: false, default: "{}" })
  meta!: string;

  @Column({
    name: "created_at",
    type: "datetime",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt!: Date;
}
