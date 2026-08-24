import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * A SECONDARY email linked to a user account (GitHub-style multi-email). The
 * PRIMARY email lives in Better Auth's `user.email` and has no row here —
 * `listEmails` composes both. Emails are globally unique across accounts and
 * stored lowercased; signing in works with any linked email (the auth
 * forwarding handler maps secondaries to the primary).
 */
@Entity({ name: "user_emails" })
@Index("uq_user_emails_email", ["email"], { unique: true })
@Index("idx_user_emails_user", ["userId"])
export class UserEmail {
  @PrimaryGeneratedColumn("increment", {
    type: "integer",
    primaryKeyConstraintName: "pk_user_emails",
  })
  id!: number;

  /** Owning user (plain text FK into Better Auth `user`). */
  @Column({ name: "user_id", type: "text", nullable: false })
  userId!: string;

  /** The linked email, lowercased. */
  @Column({ type: "text", nullable: false })
  email!: string;

  /** When the owner proved control of this address (null = pending). */
  @Column({ name: "verified_at", type: "datetime", nullable: true })
  verifiedAt!: Date | null;

  /** SHA-256 of the pending verification token (null once verified/expired). */
  @Column({ name: "token_hash", type: "text", nullable: true })
  tokenHash!: string | null;

  @Column({ name: "token_expires_at", type: "datetime", nullable: true })
  tokenExpiresAt!: Date | null;

  @Column({
    name: "created_at",
    type: "datetime",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt!: Date;
}
