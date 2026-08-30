/**
 * Commit-time guard: entity changes must ship with a new, REGISTERED migration
 * (gateway pattern, adapted to this repo's paths).
 *
 *   node scripts/migration-check.ts <commit-msg-file>
 *
 *  - entity paths are server/entities/**
 *  - migrations live in server/migrations and must ALSO be registered in the
 *    index.ts barrel (the barrel is what the runtime bundle and the CLI share —
 *    an unregistered migration file would silently never run).
 *
 * Bypass: include "bypass migration check" in the commit message.
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const migrationsDir = resolve(rootDir, "server", "migrations");

const run = (command: string): string =>
  execSync(command, { cwd: rootDir }).toString().trim();

const fail = (message: string): never => {
  console.error(message);
  console.error("Run: pnpm migration:generate --name=<Name>");
  console.error(
    'To bypass temporarily, include "bypass migration check" in the commit message.',
  );
  process.exit(1);
};

const main = (): void => {
  // Optional commit-message bypass (first CLI arg, or git's default location).
  const msgArg = process.argv[2];
  const commitMsgPath = msgArg
    ? resolve(msgArg)
    : resolve(rootDir, ".git", "COMMIT_EDITMSG");
  if (existsSync(commitMsgPath)) {
    if (
      readFileSync(commitMsgPath, "utf8").includes("bypass migration check")
    ) {
      console.log(
        "bypass migration check directive found in commit message, skipping.",
      );
      return;
    }
  }

  const staged = run("git diff --cached --name-status");
  if (!staged) return;

  const lines = staged.split("\n").map((l) => l.trim().split(/\s+/));

  const entityChanged = lines.some(([, p]) =>
    p?.startsWith("server/entities/"),
  );
  if (!entityChanged) return;

  const migrationAdded = lines.some(
    ([status, p]) => status === "A" && p?.startsWith("server/migrations/"),
  );
  if (!migrationAdded) {
    fail("Entity changes detected without a new migration.");
  }

  // Every migration file (except the barrel) must be imported by the barrel —
  // that import list is what the server actually executes.
  const files = existsSync(migrationsDir)
    ? readdirSync(migrationsDir).filter((f) => /^\d+-.*\.ts$/.test(f))
    : [];
  if (!files.length) fail("No migration files found after entity changes.");

  const barrel = readFileSync(resolve(migrationsDir, "index.ts"), "utf8");
  const unregistered = files.filter(
    (f) => !barrel.includes(`./${f.replace(/\.ts$/, "")}`),
  );
  if (unregistered.length) {
    fail(
      `Migration file(s) not registered in server/migrations/index.ts: ${unregistered.join(", ")}`,
    );
  }
};

main();
