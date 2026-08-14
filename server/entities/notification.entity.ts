import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * An in-app notification for one user. Written when permission-relevant things
 * happen around them: added as a campaign collaborator, their invoice got
 * reviewed, a campaign they participate in closed/archived. `type` is a dotted
 * key the client maps to a message + link; `data` carries the ids.
 */
@Entity({ name: "notifications" })
@Index("idx_notifications_user", ["userId", "readAt"])
export class Notification {
  @PrimaryGeneratedColumn("increment", {
    type: "integer",
    primaryKeyConstraintName: "pk_notifications",
  })
  id!: number;

  @Column({ name: "user_id", type: "text", nullable: false })
  userId!: string;

  /** Dotted type key, e.g. 'collaborator.added' | 'invoice.reviewed' | 'campaign.status'. */
  @Column({ type: "text", nullable: false })
  type!: string;

  /** Optional link target, e.g. '/?campaign=42'. */
  @Column({ type: "text", nullable: false, default: "" })
  link!: string;

  /** Small JSON payload for rendering (names, ids, decisions…). */
  @Column({ type: "text", nullable: false, default: "{}" })
  data!: string;

  @Column({ name: "read_at", type: "datetime", nullable: true })
  readAt!: Date | null;

  @Column({
    name: "created_at",
    type: "datetime",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt!: Date;
}
