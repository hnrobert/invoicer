import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

/**
 * An audit session: the buyer title + tax id the operator wants every uploaded
 * invoice checked against. Persists across restarts (the original Python app kept
 * these in memory).
 */
@Entity({ name: 'review_sessions' })
export class ReviewSession {
  @PrimaryGeneratedColumn('increment', { type: 'integer', primaryKeyConstraintName: 'pk_review_sessions' })
  id!: number

  /** Invoice title (buyer name) to match against. */
  @Column({ name: 'expected_title', type: 'text', nullable: false })
  expectedTitle!: string

  /** Unified social credit code / tax id to match against (exact). */
  @Column({ name: 'expected_tax_id', type: 'text', nullable: true })
  expectedTaxId!: string | null

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date
}
