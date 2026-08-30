import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * Assignment of a user (org role "reviewer") to a campaign group — the
 * many-to-many edge "group ↔ reviewer". A reviewer may hold several groups;
 * a group may hold several reviewers.
 */
@Entity({ name: "group_reviewers" })
@Index("uq_group_reviewers", ["groupId", "userId"], { unique: true })
@Index("idx_group_reviewers_user", ["userId"])
export class GroupReviewer {
  @PrimaryGeneratedColumn("increment", {
    type: "integer",
    primaryKeyConstraintName: "pk_group_reviewers",
  })
  id!: number;

  @Column({ name: "group_id", type: "integer", nullable: false })
  groupId!: number;

  /** The assigned reviewer (plain text FK into Better Auth `user`). */
  @Column({ name: "user_id", type: "text", nullable: false })
  userId!: string;

  @Column({
    name: "created_at",
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt!: Date;
}
