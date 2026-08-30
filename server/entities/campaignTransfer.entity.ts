import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * A pending cross-org campaign transfer. The SOURCE org's Owner/Admin (or the
 * campaign manager) initiates; the TARGET org's Owner/Admin must accept before
 * anything moves. Either side may cancel/reject while pending. On accept the
 * campaign (with its invoices and collaborators) moves to the target org.
 */
@Entity({ name: "campaign_transfers" })
@Index("idx_campaign_transfers_campaign", ["campaignId"])
@Index("idx_campaign_transfers_to", ["toOrganizationId"])
export class CampaignTransfer {
  @PrimaryGeneratedColumn("increment", {
    type: "integer",
    primaryKeyConstraintName: "pk_campaign_transfers",
  })
  id!: number;

  @Column({ name: "campaign_id", type: "integer", nullable: false })
  campaignId!: number;

  @Column({ name: "from_organization_id", type: "text", nullable: false })
  fromOrganizationId!: string;

  @Column({ name: "to_organization_id", type: "text", nullable: false })
  toOrganizationId!: string;

  @Column({ name: "requested_by", type: "text", nullable: false })
  requestedBy!: string;

  /** pending | accepted | canceled. */
  @Column({ type: "text", nullable: false, default: "pending" })
  status!: "pending" | "accepted" | "canceled";

  @Column({
    name: "created_at",
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt!: Date;
}
