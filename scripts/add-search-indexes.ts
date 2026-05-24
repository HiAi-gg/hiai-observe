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
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    console.log("  pg_trgm extension enabled");
  } catch (err) {
    console.log("  pg_trgm extension already exists or not available:", (err as Error).message);
  }

  // Full-text search vector on logs.message
  try {
    await db.execute(sql`
      ALTER TABLE logs
      ADD COLUMN IF NOT EXISTS search_vector tsvector
      GENERATED ALWAYS AS (to_tsvector('english', coalesce(message, ''))) STORED
    `);
    console.log("  logs.search_vector column added");
  } catch (err) {
    console.log("  logs.search_vector:", (err as Error).message);
  }

  try {
    await db.execute(sql`CREATE INDEX IF NOT EXISTS logs_search_vector_idx ON logs USING gin (search_vector)`);
    console.log("  logs_search_vector_idx created");
  } catch (err) {
    console.log("  logs_search_vector_idx:", (err as Error).message);
  }

  // Trigram index on logs.message for ILIKE fallback
  try {
    await db.execute(sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS logs_message_trgm_idx ON logs USING gin (message gin_trgm_ops)`);
    console.log("  logs_message_trgm_idx created");
  } catch (err) {
    console.log("  logs_message_trgm_idx:", (err as Error).message);
  }

  // Trigram index on events.stack_trace
  try {
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
