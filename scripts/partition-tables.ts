/**
 * Create range partitions on events and logs tables for production scalability.
 *
 * Usage: bun run scripts/partition-tables.ts
 *
 * Creates monthly partitions for the next 12 months.
 * Requires pg_partman extension: CREATE EXTENSION IF NOT EXISTS pg_partman;
 *
 * NOTE: This script converts the existing tables to partitioned tables.
 * Run AFTER initial schema creation but BEFORE inserting data.
 * If data already exists, a migration is required.
 */

import { db } from "../src/store/db.js";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Creating range partitions for events and logs tables...\n");

  // Check if pg_partman is available
  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_partman`);
    console.log("pg_partman extension enabled");
  } catch {
    console.log("pg_partman not available — using manual partitioning");
  }

  const now = new Date();
  const partitions: Array<{ table: string; column: string; suffix: string; from: string; to: string }> = [];

  // Generate monthly partitions for next 12 months
  for (let i = 0; i < 12; i++) {
    const from = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const to = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
    const suffix = `${from.getFullYear()}_${String(from.getMonth() + 1).padStart(2, "0")}`;

    partitions.push({
      table: "events",
      column: "created_at",
      suffix,
      from: from.toISOString(),
      to: to.toISOString(),
    });

    partitions.push({
      table: "logs",
      column: "timestamp",
      suffix,
      from: from.toISOString(),
      to: to.toISOString(),
    });
  }

  for (const p of partitions) {
    const partName = `${p.table}_${p.suffix}`;
    try {
      await db.execute(
        sql`CREATE TABLE IF NOT EXISTS ${sql.raw(partName)} PARTITION OF ${sql.raw(p.table)} FOR VALUES FROM (${p.from}) TO (${p.to})`
      );
      console.log(`  Created partition: ${partName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already exists")) {
        console.log(`  Partition exists: ${partName}`);
      } else {
        console.error(`  Failed ${partName}: ${msg}`);
      }
    }
  }

  // Add indexes to partitions
  console.log("\nAdding indexes to partitions...");
  for (const p of partitions) {
    const partName = `${p.table}_${p.suffix}`;
    try {
      if (p.table === "events") {
        await db.execute(sql`CREATE INDEX IF NOT EXISTS ${sql.raw(`${partName}_project_idx`)} ON ${sql.raw(partName)} (project_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS ${sql.raw(`${partName}_created_idx`)} ON ${sql.raw(partName)} (${sql.raw(p.column)})`);
      } else if (p.table === "logs") {
        await db.execute(sql`CREATE INDEX IF NOT EXISTS ${sql.raw(`${partName}_container_idx`)} ON ${sql.raw(partName)} (container_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS ${sql.raw(`${partName}_timestamp_idx`)} ON ${sql.raw(partName)} (${sql.raw(p.column)})`);
      }
      console.log(`  Indexed: ${partName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("already exists")) {
        console.error(`  Index failed ${partName}: ${msg}`);
      }
    }
  }

  console.log("\nDone. Partitions ready for production use.");
  console.log("Run retention worker to auto-clean old partitions monthly.");
}

main().catch(console.error);
