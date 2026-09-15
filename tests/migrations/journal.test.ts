/**
 * HIAI-OBSERVE-T02: inspect the Drizzle journal and SQL files without
 * generating or applying migrations.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
  entries: Array<{ idx: number; tag: string }>;
};

describe("drizzle migration journal", () => {
  it("journal tags match drizzle/*.sql filenames in order", () => {
    const sqlFiles = readdirSync("drizzle")
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const tags = journal.entries.map((e) => `${e.tag}.sql`);
    expect(sqlFiles).toEqual(tags);
    expect(journal.entries.map((e) => e.idx)).toEqual(sqlFiles.map((_, i) => i));
  });

  it("keeps 0000/0001 snapshots and a snapshot for every journal entry", () => {
    expect(existsSync("drizzle/meta/0000_snapshot.json")).toBe(true);
    expect(existsSync("drizzle/meta/0001_snapshot.json")).toBe(true);
    for (const entry of journal.entries) {
      const idx = String(entry.idx).padStart(4, "0");
      expect(
        existsSync(`drizzle/meta/${idx}_snapshot.json`),
        `missing drizzle/meta/${idx}_snapshot.json for ${entry.tag}`,
      ).toBe(true);
    }
  });

  it("0005 is additive IF NOT EXISTS DDL with no destructive statements", () => {
    const sql = readFileSync("drizzle/0005_logs_trace_correlation.sql", "utf8");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "trace_id"/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "span_id"/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS "logs_trace_id_idx"/);
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDELETE FROM\b/i);
  });

  it("0002 remains the project_id backfill and is also non-destructive", () => {
    const sql = readFileSync("drizzle/0002_logs_project_id.sql", "utf8");
    expect(sql).toMatch(/ADD COLUMN "project_id"/);
    expect(sql).not.toMatch(/\bDROP TABLE\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
  });
});
