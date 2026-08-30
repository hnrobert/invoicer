import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * Allowed-title edge: which stored invoice titles a campaign accepts. An
 * invoice whose extracted tax id (or contained title) matches ANY allowed
 * entry qualifies. The campaign's legacy expectedTitle/expectedTaxId columns
 * remain an implicit first allowed pair (back-compat; shown as "custom").
 */
@Entity({ name: "campaign_titles" })
@Index("uq_campaign_titles", ["campaignId", "titleId"], { unique: true })
export class CampaignTitle {
  @PrimaryGeneratedColumn("increment", {
    type: "integer",
    primaryKeyConstraintName: "pk_campaign_titles",
  })
  id!: number;

  @Column({ name: "campaign_id", type: "integer", nullable: false })
  campaignId!: number;

  @Column({ name: "title_id", type: "integer", nullable: false })
  titleId!: number;

  @Column({
    name: "created_at",
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt!: Date;
}
