-- HiAi Observe initial schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS "projects" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "name" varchar(255) NOT NULL,
  "api_key" varchar(255) NOT NULL UNIQUE,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "issues" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "title" varchar(512) NOT NULL,
  "type" varchar(64) NOT NULL,
  "fingerprint" varchar(255) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'unresolved',
  "count" integer NOT NULL DEFAULT 1,
  "first_seen" timestamp NOT NULL DEFAULT now(),
  "last_seen" timestamp NOT NULL DEFAULT now(),
  "metadata" jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS "issues_project_id_idx" ON "issues"("project_id");
CREATE INDEX IF NOT EXISTS "issues_fingerprint_idx" ON "issues"("fingerprint");

CREATE TABLE IF NOT EXISTS "events" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "issue_id" uuid REFERENCES "issues"("id") ON DELETE SET NULL,
  "type" varchar(64) NOT NULL,
  "message" text,
  "stack_trace" text,
  "context" jsonb NOT NULL DEFAULT '{}',
  "tags" jsonb NOT NULL DEFAULT '{}',
  "sdk" varchar(128),
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "events_project_id_idx" ON "events"("project_id");
CREATE INDEX IF NOT EXISTS "events_issue_id_idx" ON "events"("issue_id");
CREATE INDEX IF NOT EXISTS "events_created_at_idx" ON "events"("created_at");

CREATE TABLE IF NOT EXISTS "traces" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "trace_id" varchar(64) NOT NULL,
  "span_id" varchar(64) NOT NULL,
  "parent_span_id" varchar(64),
  "name" varchar(255) NOT NULL,
  "kind" varchar(32) NOT NULL,
  "start_time" timestamp NOT NULL,
  "end_time" timestamp,
  "attributes" jsonb NOT NULL DEFAULT '{}',
  "status" varchar(32) NOT NULL DEFAULT 'ok',
  "events" jsonb NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS "traces_project_id_idx" ON "traces"("project_id");
CREATE INDEX IF NOT EXISTS "traces_trace_id_idx" ON "traces"("trace_id");

CREATE TABLE IF NOT EXISTS "uptime_monitors" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "url" text NOT NULL,
  "interval_seconds" integer NOT NULL DEFAULT 60,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "uptime_monitors_project_id_idx" ON "uptime_monitors"("project_id");

CREATE TABLE IF NOT EXISTS "uptime_checks" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "monitor_id" uuid NOT NULL REFERENCES "uptime_monitors"("id") ON DELETE CASCADE,
  "status_code" integer,
  "response_time_ms" integer,
  "error" text,
  "checked_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "uptime_checks_monitor_id_idx" ON "uptime_checks"("monitor_id");
CREATE INDEX IF NOT EXISTS "uptime_checks_checked_at_idx" ON "uptime_checks"("checked_at");

CREATE TABLE IF NOT EXISTS "alerts" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "condition" jsonb NOT NULL,
  "channels" jsonb NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "last_triggered" timestamp,
  "cooldown_seconds" integer NOT NULL DEFAULT 300,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "alerts_project_id_idx" ON "alerts"("project_id");

CREATE TABLE IF NOT EXISTS "alert_history" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "alert_id" uuid NOT NULL REFERENCES "alerts"("id") ON DELETE CASCADE,
  "triggered_at" timestamp NOT NULL DEFAULT now(),
  "resolved_at" timestamp,
  "context" jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS "alert_history_alert_id_idx" ON "alert_history"("alert_id");
