/**
 * Apply pending migrations to the PostgreSQL database (gateway pattern).
 *
 *   pnpm migration:run [--url=postgres://…]
 *
 * Target resolution: --url flag > DATABASE_URL env > local dev default. Runs
 * the exact same code path as server boot (initDataSource), so what you get
 * locally is what production does automatically on its next start.
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

const { initDataSource, closeDataSource } =
  await import("../server/utils/database");

try {
  await initDataSource();
  console.log(
    `[migration:run] up to date · ${url.replace(/:[^:@/]+@/, ":***@")}`,
  );
} finally {
  await closeDataSource();
}
