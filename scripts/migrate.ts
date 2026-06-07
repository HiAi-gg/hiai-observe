/**
 * Apply Drizzle SQL migrations on startup using only production dependencies
 * (the `postgres` client) — no drizzle-kit (a devDependency) and no network.
 *
 * Applies every `drizzle/*.sql` file in filename order, tracking applied files
 * in a `_migrations` table so each runs once. The SQL files are idempotent
 * (CREATE TABLE / ADD COLUMN ... IF NOT EXISTS), so this is safe to re-run.
 *
 * Each statement is run individually (split on `;`) and outside a transaction,
 * because 0001 uses `CREATE INDEX CONCURRENTLY`, which cannot run inside a
 * transaction block. The files are plain DDL (no functions / dollar-quoting),
 * so splitting on `;` is safe.
 *
 * NOTE: we apply the files directly rather than via the drizzle-orm journal
 * migrator because drizzle/meta/_journal.json only registers 0000_initial,
 * while 0001–0006 were hand-written — the journal migrator would silently skip
 * them and leave the schema incomplete.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required to run migrations");
  process.exit(1);
}

const dir = "./drizzle";
const sql = postgres(url, { max: 1 });

try {
  await sql`CREATE TABLE IF NOT EXISTS _migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;

  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  let applied = 0;

  for (const file of files) {
    const [exists] = await sql`SELECT 1 FROM _migrations WHERE name = ${file}`;
    if (exists) continue;

    const content = await readFile(join(dir, file), "utf8");

    if (/concurrently/i.test(content)) {
      // CREATE INDEX CONCURRENTLY cannot run in a transaction — run each
      // statement individually in autocommit. Statements must be idempotent.
      const statements = content
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.split("\n").every((line) => {
          const t = line.trim();
          return t === "" || t.startsWith("--");
        }));
      for (const statement of statements) {
        await sql.unsafe(statement);
      }
    } else {
      // Apply atomically so a crash mid-migration rolls back cleanly.
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
      });
    }

    await sql`INSERT INTO _migrations (name) VALUES (${file})`;
    console.log(`applied ${file}`);
    applied++;
  }

  console.log(applied > 0 ? `Migrations applied (${applied})` : "Migrations up to date");
} catch (err) {
  console.error("Migration failed:", err);
  process.exit(1);
} finally {
  await sql.end();
}
