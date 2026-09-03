import "reflect-metadata";
import { DataSource } from "typeorm";
import type { Logger } from "typeorm";
import { Campaign } from "../entities/campaign.entity";
import { CampaignCollaborator } from "../entities/campaignCollaborator.entity";
import { Invoice } from "../entities/invoice.entity";
import { MailConfig } from "../entities/mailConfig.entity";
import { AppSetting } from "../entities/appSetting.entity";
import { OrgSetting } from "../entities/orgSetting.entity";
import { AuditLog } from "../entities/auditLog.entity";
import { Notification } from "../entities/notification.entity";
import { CampaignTransfer } from "../entities/campaignTransfer.entity";
import { OrgCustomRole } from "../entities/orgCustomRole.entity";
import { UserEmail } from "../entities/userEmail.entity";
import { SiteAdmin } from "../entities/siteAdmin.entity";
import { Passkey } from "../entities/passkey.entity";
import { CampaignGroup } from "../entities/campaignGroup.entity";
import { GroupReviewer } from "../entities/groupReviewer.entity";
import { InvoiceTitle } from "../entities/invoiceTitle.entity";
import { CampaignTitle } from "../entities/campaignTitle.entity";
import { migrations } from "../migrations";

/** PostgreSQL connection — compose's `postgres` service in deployment. */
export const databaseUrl =
  process.env.DATABASE_URL ||
  "postgres://invoicer:invoicer@localhost:15432/invoicer";

class StartupLogger implements Logger {
  logQuery(): void {}
  logQueryError(error: string | Error, query: string): void {
    console.error(`[db] query error: ${error}\n  ${query}`);
  }
  logQuerySlow(): void {}
  logSchemaBuild(message: string): void {
    console.log(`[db] schema · ${message}`);
  }
  logMigration(message: string): void {
    console.log(`[db] migration · ${message}`);
  }
  log(level: "log" | "info" | "warn", message: unknown): void {
    if (level === "warn") console.warn(`[db] ${message}`);
    else console.log(`[db] ${message}`);
  }
}

export const AppDataSource = new DataSource({
  type: "postgres",
  url: databaseUrl,
  // Explicit class array — Nitro bundling doesn't play nicely with glob-based
  // entity discovery (`entities: ['dist/**/*.entity.js']`).
  entities: [
    Campaign,
    Invoice,
    CampaignCollaborator,
    MailConfig,
    AppSetting,
    OrgSetting,
    AuditLog,
    Notification,
    CampaignTransfer,
    OrgCustomRole,
    UserEmail,
    SiteAdmin,
    Passkey,
    CampaignGroup,
    GroupReviewer,
    InvoiceTitle,
    CampaignTitle,
  ],
  migrations,
  // Schema changes go through migrations ONLY (server/migrations/, the
  // verifier-gateway pattern). `synchronize: true` treated renames as
  // drop+create and must stay off.
  synchronize: false,
  logging: ["error", "warn"],
  logger: new StartupLogger(),
});

export async function initDataSource(): Promise<void> {
  if (AppDataSource.isInitialized) return;
  await AppDataSource.initialize();
  // Auto-apply pending migrations on every boot (dev and prod alike) — this is
  // what lets `pnpm migration:generate` output take effect on the next start.
  if (await AppDataSource.showMigrations()) {
    const applied = await AppDataSource.runMigrations({ transaction: "each" });
    for (const m of applied) console.log(`[db] migration applied · ${m.name}`);
  }
  const tables = (
    (await AppDataSource.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public'",
    )) as unknown[]
  ).length;
  console.log(`[db] ready · postgres · ${tables} table(s)`);
}

export async function closeDataSource(): Promise<void> {
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
}
