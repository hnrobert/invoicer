import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";
import type { InvoiceStatus } from "#shared/types";

/**
 * A single uploaded invoice file and its audit outcome. `campaignId` is a plain
 * integer FK into `campaigns` (no TypeORM relation decorator — same convention
 * as the reference project). The extracted text/OCR result is cached in
 * `rawText` for debugging.
 */
@Entity({ name: "invoices" })
@Index("idx_invoices_campaign", ["campaignId"])
@Index("idx_invoices_status", ["status"])
export class Invoice {
  @PrimaryGeneratedColumn("increment", {
    type: "integer",
    primaryKeyConstraintName: "pk_invoices",
  })
  id!: number;

  @Column({ name: "campaign_id", type: "integer", nullable: false })
  campaignId!: number;

  @Column({ type: "text", nullable: false })
  filename!: string;

  /** Path under the uploads dir (server-side only, never returned to the client). */
  @Column({ name: "saved_path", type: "text", nullable: false })
  savedPath!: string;

  /** 'pdf' (text-extracted) or 'image' (OCR'd) — decides the recognition path. */
  @Column({ name: "file_type", type: "text", nullable: false })
  fileType!: "pdf" | "image";

  @Column({ type: "text", nullable: false, default: "pending" })
  status!: InvoiceStatus;

  @Column({ type: "text", nullable: true })
  reason!: string | null;

  @Column({ name: "extracted_title", type: "text", nullable: true })
  extractedTitle!: string | null;

  @Column({ name: "extracted_tax_id", type: "text", nullable: true })
  extractedTaxId!: string | null;

  /** 价税合计 / 小写金额. SQLite `real`. */
  @Column({ name: "extracted_amount", type: "real", nullable: true })
  extractedAmount!: number | null;

  /** Operator-entered amount when extraction found none. */
  @Column({ name: "manual_amount", type: "real", nullable: true })
  manualAmount!: number | null;

  /** Whether this invoice's amount is included in the session total. */
  @Column({
    name: "amount_in_total",
    type: "boolean",
    nullable: false,
    default: false,
  })
  amountInTotal!: boolean;

  @Column({ name: "raw_text", type: "text", nullable: true })
  rawText!: string | null;

  @Column({ type: "text", nullable: true })
  error!: string | null;

  @Column({
    name: "created_at",
    type: "datetime",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt!: Date;

  @Column({ name: "processed_at", type: "datetime", nullable: true })
  processedAt!: Date | null;
}
