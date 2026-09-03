/**
 * One-time data migration: SQLite (the pre-Postgres storage) → PostgreSQL.
 *
 *   pnpm tsx scripts/migrate-sqlite-to-pg.ts [--dry] [--sqlite=./data/app.db]
 *                                           [--url=postgres://…]
 *
 * Prerequisite: the PG target must already have the schema (run
 * `pnpm migration:run` first). Reads every table from the SQLite file in
 * FK-safe order, coerces values to the PG column types (information_schema),
 * inserts, then resets identity sequences past the max ids.
 *
 * --dry lists row counts and coercion plan without writing.
 */
import Database from "better-sqlite3";
import { Pool } from "pg";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const flag = (name: string, fallback: string) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : fallback;
};
const sqlitePath = flag("sqlite", process.env.DB_PATH || "./data/app.db");
const url =
  flag("url", "") ||
  process.env.DATABASE_URL ||
  "postgres://invoicer:invoicer@localhost:15432/invoicer";

/** FK-safe order: parents before children. */
const TABLES = [
  "user",
  "session",
  "account",
  "verification",
  "organization",
  "member",
  "invitation",
  "campaigns",
  "campaign_collaborators",
  "mail_configs",
  "app_settings",
  "org_settings",
  "audit_logs",
  "notifications",
  "campaign_transfers",
  "site_admins",
  "passkeys",
  "campaign_groups",
  "group_reviewers",
  "invoices",
  "invoice_titles",
  "campaign_titles",
  "org_custom_roles",
  "user_emails",
] as const;

async function main() {
  const lite = new Database(sqlitePath, { readonly: true });
  const pg = new Pool({ connectionString: url });

  // PG column types per table, from the live schema.
  const pgTypes = new Map<string, Map<string, string>>();
  for (const t of TABLES) {
    const cols = (
      await pg.query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1`,
        [t],
      )
    ).rows as { column_name: string; data_type: string }[];
    pgTypes.set(t, new Map(cols.map((c) => [c.column_name, c.data_type])));
  }

  let total = 0;
  for (const t of TABLES) {
    const types = pgTypes.get(t)!;
    const liteCols = lite
      .prepare(`PRAGMA table_info(${JSON.stringify(t)})`)
      .all() as { name: string }[];
    const cols = liteCols.map((c) => c.name).filter((c) => types.has(c));
    if (!cols.length) {
      console.log(`[skip] ${t}: no overlapping columns`);
      continue;
    }
    const rows = lite
      .prepare(`SELECT ${cols.map((c) => `"${c}"`).join(", ")} FROM "${t}"`)
      .all() as Record<string, unknown>[];
    console.log(`${DRY ? "[dry] " : ""}${t}: ${rows.length} rows`);

    if (!DRY && rows.length) {
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      const stmt = `INSERT INTO "${t}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
      for (const r of rows) {
        const values = cols.map((c) => {
          const v = r[c];
          const dt = types.get(c)!;
          if (dt === "boolean") return v == null ? null : !!v;
          if (dt === "bytea")
            return v == null ? null : Buffer.from(v as Uint8Array);
          return v;
        });
        await pg.query(stmt, values);
      }
      total += rows.length;
    }
  }

  // Identity sequences must pass the migrated max ids (ON CONFLICT DO NOTHING
  // keeps ids, but sequences start at 1 regardless). Only tables with an
  // integer identity `id` qualify; the rest (text PKs like "user", key/valu
  // tables) are skipped.
  if (!DRY) {
    for (const t of TABLES) {
      const seq = (
        await pg
          .query(`SELECT pg_get_serial_sequence($1, 'id') AS seq`, [`"${t}"`])
          .catch(() => ({ rows: [{ seq: null }] }))
      ).rows[0] as { seq: string | null };
      if (!seq?.seq) continue;
      await pg.query(
        `SELECT setval($1, GREATEST((SELECT COALESCE(MAX(id), 0) FROM "${t}"), 1))`,
        [seq.seq],
      );
    }
    console.log(
      `done: ${total} rows migrated${DRY ? " (dry — nothing written)" : ""}`,
    );
  }

  lite.close();
  await pg.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
