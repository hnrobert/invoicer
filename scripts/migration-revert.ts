/**
 * Revert the LAST applied migration (one step) — gateway pattern.
 *
 *   pnpm migration:revert [--url=postgres://…]
 *
 * Destructive by definition — back up the database first. Each migration's
 * down() is wrapped in its own transaction.
 */
function resolveUrl(): string {
  const arg = process.argv.find((a) => a.startsWith("--url="));
  if (arg) return arg.slice(6);
  return (
    process.env.DATABASE_URL ||
    "postgres://invoicer:invoicer@localhost:5432/invoicer"
  );
}

const url = resolveUrl();
process.env.DATABASE_URL = url;

const { AppDataSource } = await import("../server/utils/database");

try {
  await AppDataSource.initialize();
  const before = (
    (await AppDataSource.query(
      "SELECT name FROM migrations ORDER BY id DESC LIMIT 1",
    )) as { name: string }[]
  )[0]?.name;
  await AppDataSource.undoLastMigration({ transaction: "each" });
  const after = (
    (await AppDataSource.query(
      "SELECT name FROM migrations ORDER BY id DESC LIMIT 1",
    )) as { name: string }[]
  )[0]?.name;
  console.log(
    `[migration:revert] reverted · ${before ?? "(none)"} → now at ${after ?? "(empty)"}`,
  );
} finally {
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
}
