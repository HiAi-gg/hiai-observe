/**
 * Default unit files must not statically import store/db.js. That module
 * constructs a postgres client at load; a generic `bun run test` must not
 * touch shared workstation data.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const SKIP_DIRS = new Set(["e2e", "integration"]);

function listTestFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      out.push(...listTestFiles(full));
    } else if (name.endsWith(".test.ts") || name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("unit suite database imports", () => {
  it("does not statically import src/store/db.js outside e2e/integration", () => {
    const files = listTestFiles(ROOT);
    const offenders: string[] = [];
    const pattern = /from\s+["'][^"']*store\/db\.js["']/;
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (pattern.test(src)) offenders.push(relative(ROOT, file));
    }
    expect(offenders).toEqual([]);
  });
});
