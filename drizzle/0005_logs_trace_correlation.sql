-- Additive log↔trace columns. Docker entrypoint always runs scripts/migrate.ts,
-- so the next container start against a DB that has not applied 0003 will.
-- CREATE INDEX (not CONCURRENTLY) runs inside migrate.ts's transaction and can
-- lock writes on a large logs table. No backfill: historical rows keep
-- raw.traceId; searchLogs ?traceId= matches the first-class column only.
ALTER TABLE "logs" ADD COLUMN IF NOT EXISTS "trace_id" text;--> statement-breakpoint
ALTER TABLE "logs" ADD COLUMN IF NOT EXISTS "span_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "logs_trace_id_idx" ON "logs" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "logs_project_trace_idx" ON "logs" USING btree ("project_id","trace_id");
