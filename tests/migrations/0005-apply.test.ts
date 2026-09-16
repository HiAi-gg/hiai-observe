/**
 * Isolated old→new apply of drizzle/0005_logs_trace_correlation.sql.
 *
 * Never runs against app_hiai_observe. Requires DATABASE_URL matching
 * isIsolatedObserveFixture (local observe_test/hiai_observe_test or CI
 * observe/hiai_observe).
 *
 * Applies every earlier drizzle/*.sql file first (0000–0004 on origin/main,
 * including Better Auth) so this matches scripts/migrate.ts filename order.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isIsolatedObserveFixture } from "../lib/isolated-db.js";

const live =
  process.env.OBSERVE_MIGRATE_LIVE === "1" && isIsolatedObserveFixture(process.env.DATABASE_URL);
const drizzleDir = join(import.meta.dirname, "../../drizzle");
const CORRELATION = "0005_logs_trace_correlation.sql";

describe.skipIf(!live)("0005 logs trace correlation — isolated old→new apply", () => {
  let sql: postgres.Sql;
  const applied: string[] = [];

  async function applyFile(name: string) {
    const content = await readFile(join(drizzleDir, name), "utf8");
    await sql.unsafe(content);
    applied.push(name);
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (process.env.OBSERVE_MIGRATE_LIVE !== "1" || !isIsolatedObserveFixture(url)) {
      throw new Error("0005 apply requires OBSERVE_MIGRATE_LIVE=1 and isolated DATABASE_URL");
    }
    sql = postgres(url as string, { max: 1 });
    // Drop tables only — DROP SCHEMA CASCADE also drops extensions the
    // observe_test role cannot recreate (vector / pg_trgm / pgcrypto).
    await sql.unsafe(`
      DO $$ DECLARE r record;
      BEGIN
        FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
          EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
        END LOOP;
      END $$;
    `);
    const files = (await readdir(drizzleDir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (file === CORRELATION) continue;
      await applyFile(file);
    }
  });

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  it("keeps pre-correlation log rows readable and adds nullable trace_id / span_id", async () => {
    const [inserted] = await sql<{ id: string }[]>`
      INSERT INTO logs (container_id, container_name, stream, message, timestamp, raw)
      VALUES (
        'c-old',
        'old-container',
        'stdout',
        'before correlation',
        NOW(),
        '{"traceId":"raw-trace-in-json"}'::jsonb
      )
      RETURNING id
    `;

    const beforeCols = await sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'logs'
        AND column_name IN ('trace_id', 'span_id')
      ORDER BY column_name
    `;
    expect(beforeCols).toEqual([]);

    await applyFile(CORRELATION);

    const afterCols = await sql<{ column_name: string; is_nullable: string }[]>`
      SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'logs'
        AND column_name IN ('trace_id', 'span_id')
      ORDER BY column_name
    `;
    expect(afterCols).toEqual([
      { column_name: "span_id", is_nullable: "YES" },
      { column_name: "trace_id", is_nullable: "YES" },
    ]);

    const [oldRow] = await sql<
      {
        id: string;
        message: string;
        trace_id: string | null;
        span_id: string | null;
        raw: { traceId?: string };
      }[]
    >`
      SELECT id, message, trace_id, span_id, raw FROM logs WHERE id = ${inserted.id}
    `;
    expect(oldRow.message).toBe("before correlation");
    expect(oldRow.trace_id).toBeNull();
    expect(oldRow.span_id).toBeNull();
    expect(oldRow.raw.traceId).toBe("raw-trace-in-json");

    const [fresh] = await sql<{ trace_id: string; span_id: string }[]>`
      INSERT INTO logs (container_id, container_name, stream, message, timestamp, trace_id, span_id)
      VALUES ('c-new', 'new-container', 'otel', 'correlated', NOW(), 'abc-trace', 'abc-span')
      RETURNING trace_id, span_id
    `;
    expect(fresh).toEqual({ trace_id: "abc-trace", span_id: "abc-span" });

    await sql`CREATE TABLE IF NOT EXISTS _migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`;
    for (const name of [...applied]) {
      await sql`INSERT INTO _migrations (name) VALUES (${name}) ON CONFLICT (name) DO NOTHING`;
    }
  });
});
