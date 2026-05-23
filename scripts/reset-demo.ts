/**
 * Reset and re-seed demo data.
 * Run: bun run scripts/reset-demo.ts
 */

import { db } from "../src/store/db.js";
import {
  projects, issues, events, uptimeMonitors, uptimeChecks,
  alerts, alertHistory, traces, logs, hostStats, containerStats,
} from "../src/store/schema.js";

async function reset() {
  console.log("Resetting HiAi Observe demo data...\n");

  for (const table of [alertHistory, logs, hostStats, containerStats, alerts, traces, uptimeChecks, uptimeMonitors, events, issues, projects]) {
    await db.delete(table);
  }

  console.log("All tables cleared.");
  console.log("Run `bun run seed` to re-populate.\n");
}

reset().then(() => process.exit(0)).catch((err) => { console.error("Reset failed:", err); process.exit(1); });
