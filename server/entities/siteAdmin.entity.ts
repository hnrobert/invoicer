import { Column, Entity, PrimaryColumn } from "typeorm";

/**
 * Persistent superadmin grants. The FIRST registered user is granted once at
 * bootstrap (`source='bootstrap'`, decided at registration time — not derived
 * from timestamps on every check). SUPERADMIN_EMAILS env entries are checked
 * at runtime in addition to this table.
 */
@Entity({ name: "site_admins" })
export class SiteAdmin {
  /** The granted user (plain text FK into Better Auth `user`). */
  @PrimaryColumn({ name: "user_id", type: "text" })
  userId!: string;

  /** How the grant happened: bootstrap (first registrant) | env | granted. */
  @Column({ type: "text", nullable: false, default: "granted" })
  source!: "bootstrap" | "env" | "granted";

  @Column({
    name: "created_at",
    type: "datetime",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt!: Date;
}
