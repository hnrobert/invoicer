import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * A registered WebAuthn credential (a "passkey") for a user. One user may
 * have many passkeys (one per device). The credential id (base64url) is the
 * lookup key during discoverable login — it's globally unique across users.
 *
 * `public_key` is the SPKI public key bytes; stored as blob (better-sqlite3
 * returns a Buffer, converted to Uint8Array on read for SimpleWebAuthn).
 */
@Entity({ name: "passkeys" })
@Index("uq_passkeys_credential_id", ["credentialId"], { unique: true })
@Index("idx_passkeys_user", ["userId"])
export class Passkey {
  @PrimaryGeneratedColumn("increment", {
    type: "integer",
    primaryKeyConstraintName: "pk_passkeys",
  })
  id!: number;

  @Column({ name: "credential_id", type: "text", nullable: false })
  credentialId!: string;

  /** Owner (plain text FK into Better Auth `user`). */
  @Column({ name: "user_id", type: "text", nullable: false })
  userId!: string;

  /** SPKI public key bytes (blob → Buffer; Uint8Array on read). */
  @Column({ name: "public_key", type: "bytea", nullable: false })
  publicKey!: Buffer;

  /** Signature counter — clone detection. */
  @Column({ type: "integer", nullable: false, default: 0 })
  counter!: number;

  /** JSON(AuthenticatorTransportFuture[]) — helps the browser pick a credential. */
  @Column({ type: "text", nullable: true })
  transports!: string | null;

  /** 'singleDevice' | 'multiDevice'. */
  @Column({ name: "device_type", type: "text", nullable: true })
  deviceType!: string | null;

  @Column({
    name: "backed_up",
    type: "boolean",
    nullable: false,
    default: false,
  })
  backedUp!: boolean;

  @Column({
    name: "created_at",
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt!: Date;
}
