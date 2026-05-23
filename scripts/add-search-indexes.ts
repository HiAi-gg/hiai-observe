/**
 * Add full-text search indexes for log search performance.
 * Run: bun run scripts/add-search-indexes.ts
 *
 * Requires PostgreSQL with pg_trgm extension support.
 */

import { db } from "../src/store/db.js";
import { sql } from "drizzle-orm";

async function addSearchIndexes() {
  console.log("Adding search indexes...\n");

  try {
    // Enable trigram extension for efficient substring search
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    console.log("  pg_trgm extension enabled");
  } catch (err) {
    console.log("  pg_trgm extension already exists or not available:", (err as Error).message);
  }

  try {
    // GIN index on logs.message for trigram-based search
    await db.execute(sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS logs_message_trgm_idx ON logs USING gin (message gin_trgm_ops)`);
    console.log("  logs_message_trgm_idx created");
  } catch (err) {
    console.log("  logs_message_trgm_idx:", (err as Error).message);
  }

  try {
    // GIN index on events.stack_trace for stack trace search
    await db.execute(sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS events_stack_trace_trgm_idx ON events USING gin (stack_trace gin_trgm_ops)`);
    console.log("  events_stack_trace_trgm_idx created");
  } catch (err) {
    console.log("  events_stack_trace_trgm_idx:", (err as Error).message);
  }

  console.log("\nDone!");
  process.exit(0);
}

addSearchIndexes().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
