import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * A campaign collaborator — a participant granted direct access to one
 * campaign (GitHub repo-collaborator style): can view the campaign, upload
 * their own invoices, and see their own results + the campaign summary. No
 * permission tiers; review/export stay with org Editor+ and the campaign
 * manager. Usually used to invite people from outside the owning organization
 * into internal/private campaigns.
 */
@Entity({ name: "campaign_collaborators" })
@Index("uq_campaign_collaborators", ["campaignId", "userId"], { unique: true })
@Index("idx_campaign_collaborators_user", ["userId"])
export class CampaignCollaborator {
  @PrimaryGeneratedColumn("increment", {
    type: "integer",
    primaryKeyConstraintName: "pk_campaign_collaborators",
  })
  id!: number;

  /** Campaign the collaborator belongs to (integer FK into `campaigns`). */
  @Column({ name: "campaign_id", type: "integer", nullable: false })
  campaignId!: number;

  /** The collaborating user (plain text FK into Better Auth `user`). */
  @Column({ name: "user_id", type: "text", nullable: false })
  userId!: string;

  @Column({
    name: "created_at",
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt!: Date;
}
