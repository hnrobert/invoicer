import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Site-wide SMTP config for emailing audit reports. Stored as a single row
 * keyed by the reserved `userId = 0` (no real user has id 0) — same pattern as
 * the reference project. SMTP-only (no HTTP-webhook provider).
 */
@Entity({ name: 'mail_configs' })
@Index('uq_mail_configs_user', ['userId'], { unique: true })
export class MailConfig {
  @PrimaryGeneratedColumn('increment', { type: 'integer', primaryKeyConstraintName: 'pk_mail_configs' })
  id!: number

  /** Reserved site-wide owner id. */
  @Column({ name: 'user_id', type: 'integer', nullable: false })
  userId!: number

  // --- SMTP server ---
  @Column({ name: 'smtp_server', type: 'text', default: '' })
  smtpServer!: string

  @Column({ name: 'smtp_port', type: 'integer', default: 465 })
  smtpPort!: number

  /** Implicit TLS (direct socket TLS, typically port 465). */
  @Column({ name: 'use_ssl', type: 'boolean', default: true })
  useSsl!: boolean

  /** Upgrade via STARTTLS (typically port 587/25). */
  @Column({ name: 'use_tls', type: 'boolean', default: false })
  useTls!: boolean

  /** Authenticate with sender_email / sender_password. */
  @Column({ name: 'use_password', type: 'boolean', default: true })
  usePassword!: boolean

  // --- Sender ---
  @Column({ name: 'sender_email', type: 'text', default: '' })
  senderEmail!: string

  @Column({ name: 'sender_email_display', type: 'text', default: '' })
  senderEmailDisplay!: string

  @Column({ name: 'sender_domain', type: 'text', default: '' })
  senderDomain!: string

  @Column({ name: 'sender_password', type: 'text', default: '' })
  senderPassword!: string

  // --- Limits ---
  @Column({ name: 'max_len_recipient_email', type: 'integer', default: 64 })
  maxLenRecipientEmail!: number

  @Column({ name: 'max_len_subject', type: 'integer', default: 255 })
  maxLenSubject!: number

  @Column({ name: 'max_len_body', type: 'integer', default: 50000 })
  maxLenBody!: number

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date

  @Column({
    name: 'updated_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt!: Date
}
