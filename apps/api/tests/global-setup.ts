import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const apiRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * Brings the test database up to date before any test runs.
 * Skipped (with a warning) when TEST_DATABASE_URL is not filled in yet, so the
 * DB-free unit tests still run.
 */
export default function globalSetup(): void {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

  if (!testDatabaseUrl) {
    console.warn("[vitest] TEST_DATABASE_URL is not set — DB-backed tests are skipped.");
    return;
  }

  if (testDatabaseUrl === process.env.DATABASE_URL?.trim()) {
    console.warn("[vitest] TEST_DATABASE_URL equals DATABASE_URL — refusing to migrate the dev database.");
    return;
  }

  console.log("[vitest] applying migrations to the test database");
  execSync("npx prisma migrate deploy", {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: "inherit",
  });
}
