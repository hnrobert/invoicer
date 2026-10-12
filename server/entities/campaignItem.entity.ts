import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * A reimbursement item (报销条目) inside one campaign — one project per item
 * (e.g. "扇子×200 · 团委"): an invoice plus its same-price quotation/receipt
 * evidence. Invoice files attach to items as supporting evidence
 * (`invoices.item_id`); the item's actual total is the sum of its attached
 * invoices. `groupId` reuses campaign groups as the channel (团委/CS…).
 */
@Entity({ name: "campaign_items" })
@Index("uq_campaign_items_name", ["campaignId", "name"], { unique: true })
@Index("idx_campaign_items_campaign", ["campaignId"])
export class CampaignItem {
  @PrimaryGeneratedColumn("increment", {
    type: "integer",
    primaryKeyConstraintName: "pk_campaign_items",
  })
  id!: number;

  @Column({ name: "campaign_id", type: "integer", nullable: false })
  campaignId!: number;

  @Column({ type: "text", nullable: false })
  name!: string;

  /** Channel (FK into campaign_groups; null = no channel). */
  @Column({ name: "group_id", type: "integer", nullable: true })
  groupId!: number | null;

  /** Who paid out of pocket (垫付人). */
  @Column({ type: "text", nullable: true })
  payer!: string | null;

  @Column({ type: "text", nullable: true })
  note!: string | null;

  @Column({
    name: "created_at",
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt!: Date;
}
