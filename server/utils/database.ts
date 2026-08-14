import "reflect-metadata";
import "better-sqlite3";
import { DataSource } from "typeorm";
import type { Logger } from "typeorm";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Campaign } from "#server/entities/campaign.entity";
import { Invoice } from "#server/entities/invoice.entity";
import { MailConfig } from "#server/entities/mailConfig.entity";
import { AppSetting } from "#server/entities/appSetting.entity";

const dbPath = process.env.DB_PATH || "./data/app.db";

class StartupLogger implements Logger {
  logQuery(): void {}
  logQueryError(error: string | Error, query: string): void {
    console.error(`[db] query error: ${error}\n  ${query}`);
  }
  logQuerySlow(): void {}
  logSchemaBuild(message: string): void {
    console.log(`[db] schema · ${message}`);
  }
  logMigration(): void {}
  log(level: "log" | "info" | "warn", message: unknown): void {
    if (level === "warn") console.warn(`[db] ${message}`);
    else console.log(`[db] ${message}`);
  }
}

export const AppDataSource = new DataSource({
  type: "better-sqlite3",
  database: dbPath,
  // Explicit class array — Nitro bundling doesn't play nicely with glob-based
  // entity discovery (`entities: ['dist/**/*.entity.js']`).
  entities: [Campaign, Invoice, MailConfig, AppSetting],
  // No migration files: the schema is derived from the entity classes on boot.
  synchronize: true,
  logging: ["schema", "error", "warn"],
  logger: new StartupLogger(),
});

export async function initDataSource(): Promise<void> {
  if (AppDataSource.isInitialized) return;
  // better-sqlite3 won't create the data directory itself.
  await mkdir(dirname(dbPath), { recursive: true }).catch(() => {});
  await AppDataSource.initialize();
  console.log(`[db] ready · ${dbPath}`);
}

export async function closeDataSource(): Promise<void> {
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
}
