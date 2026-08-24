import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * A named group of invoices inside one campaign. Groups partition a
 * campaign's invoices so review duty can be delegated: each group maps to
 * one or more REVIEWERS (org role), and a reviewer may cover several groups.
 */
@Entity({ name: "campaign_groups" })
@Index("uq_campaign_groups_name", ["campaignId", "name"], { unique: true })
@Index("idx_campaign_groups_campaign", ["campaignId"])
export class CampaignGroup {
  @PrimaryGeneratedColumn("increment", {
    type: "integer",
    primaryKeyConstraintName: "pk_campaign_groups",
  })
  id!: number;

  @Column({ name: "campaign_id", type: "integer", nullable: false })
  campaignId!: number;

  @Column({ type: "text", nullable: false })
  name!: string;

  @Column({
    name: "created_at",
    type: "datetime",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt!: Date;
}
