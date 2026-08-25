import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * A stored invoice title (发票抬头) with its full reimbursement fields — the
 * billing entity to match uploaded invoices against, and the info reviewers
 * need (bank account / address / phone) to issue payment.
 *
 * Ownership: 'user' (personal, ownerId = user id), 'org' (organization
 * title, ownerId = org id), or 'site' (admin-managed, visible to everyone).
 * A campaign may allow SEVERAL titles (campaign_titles join table) — an
 * invoice matching ANY allowed title's tax id / name qualifies.
 */
@Entity({ name: "invoice_titles" })
@Index("idx_invoice_titles_owner", ["ownerType", "ownerId"])
export class InvoiceTitle {
  @PrimaryGeneratedColumn("increment", {
    type: "integer",
    primaryKeyConstraintName: "pk_invoice_titles",
  })
  id!: number;

  /** 'user' | 'org' | 'site'. */
  @Column({ name: "owner_type", type: "text", nullable: false })
  ownerType!: "user" | "org" | "site";

  /** Owning user/org id ('' for site-managed). */
  @Column({ name: "owner_id", type: "text", nullable: false, default: "" })
  ownerId!: string;

  /** The title proper — buyer name, e.g. 宁波诺丁汉大学. */
  @Column({ type: "text", nullable: false })
  title!: string;

  /** Unified social credit code / tax id (exact match key). */
  @Column({ name: "tax_id", type: "text", nullable: false, default: "" })
  taxId!: string;

  @Column({ name: "bank_name", type: "text", nullable: false, default: "" })
  bankName!: string;

  @Column({ name: "bank_account", type: "text", nullable: false, default: "" })
  bankAccount!: string;

  @Column({ type: "text", nullable: false, default: "" })
  address!: string;

  @Column({ type: "text", nullable: false, default: "" })
  phone!: string;

  @Column({
    name: "created_at",
    type: "datetime",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt!: Date;
}
