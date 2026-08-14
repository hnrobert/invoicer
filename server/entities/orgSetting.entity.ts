import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * Per-organization platform settings, keyed by Better Auth's organization id
 * (plain text FK, no relation — same convention as the rest of the project).
 * A **private** org hides its org page from outsiders and keeps its campaigns
 * off the explore plaza / search; public campaigns inside it stay reachable
 * by direct link.
 */
@Entity({ name: "org_settings" })
@Index("uq_org_settings_org", ["organizationId"], { unique: true })
export class OrgSetting {
  @PrimaryGeneratedColumn("increment", {
    type: "integer",
    primaryKeyConstraintName: "pk_org_settings",
  })
  id!: number;

  @Column({ name: "organization_id", type: "text", nullable: false })
  organizationId!: string;

  /** 'public' (default — org visible, campaigns can reach the plaza) | 'private'. */
  @Column({ type: "text", nullable: false, default: "public" })
  visibility!: "public" | "private";

  @Column({
    name: "updated_at",
    type: "datetime",
    default: () => "CURRENT_TIMESTAMP",
    onUpdate: "CURRENT_TIMESTAMP",
  })
  updatedAt!: Date;
}
