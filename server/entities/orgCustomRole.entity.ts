import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * A named custom role inside one organization (GitHub custom-role style): a
 * display name bound to one of the five BASE roles. Members carry the custom
 * role's name in Better Auth's `member.role`; permission resolution maps it
 * back to the base role's rights (granular permission bits are a future step).
 */
@Entity({ name: "org_custom_roles" })
@Index("uq_org_custom_roles", ["organizationId", "name"], { unique: true })
export class OrgCustomRole {
  @PrimaryGeneratedColumn("increment", {
    type: "integer",
    primaryKeyConstraintName: "pk_org_custom_roles",
  })
  id!: number;

  @Column({ name: "organization_id", type: "text", nullable: false })
  organizationId!: string;

  /** Display name members are assigned (stored verbatim in member.role). */
  @Column({ type: "text", nullable: false })
  name!: string;

  /** The base role whose rights apply: admin | editor | viewer | member. */
  @Column({ name: "base_role", type: "text", nullable: false })
  baseRole!: "admin" | "editor" | "viewer" | "member";

  /**
   * JSON array of org permission keys (server/utils/orgPermissions.ts) —
   * every permission individually toggleable per role. baseRole is only the
   * creation template; effective rights come from here alone. '[]' = none.
   */
  @Column({ type: "text", nullable: false, default: "[]" })
  permissions!: string;

  @Column({
    name: "created_at",
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt!: Date;
}
