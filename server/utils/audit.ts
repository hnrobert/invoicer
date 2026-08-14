import { AppDataSource } from "./database";
import { AuditLog } from "#server/entities/auditLog.entity";

/**
 * Append an audit entry. Fire-and-forget by design: an audit failure must
 * never break the audited action — errors are logged instead of thrown.
 */
export function logAudit(entry: {
  organizationId?: string | null;
  campaignId?: number | null;
  actorId: string;
  action: string;
  target?: string;
  meta?: Record<string, unknown>;
}): void {
  AppDataSource.getRepository(AuditLog)
    .save({
      organizationId: entry.organizationId ?? null,
      campaignId: entry.campaignId ?? null,
      actorId: entry.actorId,
      action: entry.action,
      target: entry.target ?? "",
      meta: JSON.stringify(entry.meta ?? {}),
    })
    .catch((e) => console.error("[audit]", e));
}
