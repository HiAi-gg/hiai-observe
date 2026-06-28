CREATE TABLE "alert_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid NOT NULL,
	"triggered_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"context" jsonb
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"severity" text DEFAULT 'warning' NOT NULL,
	"condition" jsonb,
	"channels" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"cooldown_seconds" integer DEFAULT 300 NOT NULL,
	"escalation_minutes" integer,
	"last_triggered" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "container_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" text DEFAULT 'local' NOT NULL,
	"container_id" text NOT NULL,
	"name" text NOT NULL,
	"image" text NOT NULL,
	"cpu_percent" real NOT NULL,
	"memory_usage_mb" real NOT NULL,
	"memory_limit_mb" real NOT NULL,
	"network_rx_bytes" bigint DEFAULT 0 NOT NULL,
	"network_tx_bytes" bigint DEFAULT 0 NOT NULL,
	"network_rx_rate" bigint DEFAULT 0 NOT NULL,
	"network_tx_rate" bigint DEFAULT 0 NOT NULL,
	"block_read_bytes" bigint DEFAULT 0 NOT NULL,
	"block_write_bytes" bigint DEFAULT 0 NOT NULL,
	"memory_percent" real DEFAULT 0 NOT NULL,
	"restart_count" integer DEFAULT 0 NOT NULL,
	"health_status" text,
	"status" text NOT NULL,
	"uptime_seconds" integer DEFAULT 0 NOT NULL,
	"collected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"issue_id" uuid,
	"message" text,
	"exception_type" text,
	"stack_trace" text,
	"level" text DEFAULT 'error',
	"tags" jsonb,
	"context" jsonb,
	"fingerprint" text,
	"sdk" text,
	"environment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fingerprint_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"pattern" text NOT NULL,
	"group_by" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gpu_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" text NOT NULL,
	"gpu_index" integer NOT NULL,
	"utilization_percent" real NOT NULL,
	"memory_used_mb" real NOT NULL,
	"memory_total_mb" real NOT NULL,
	"temperature_c" real,
	"collected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "host_info" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" text NOT NULL,
	"os_name" text,
	"kernel_version" text,
	"cpu_model" text,
	"core_count" integer,
	"architecture" text,
	"uptime_seconds" bigint,
	"collected_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "host_info_host_id_unique" UNIQUE("host_id")
);
--> statement-breakpoint
CREATE TABLE "host_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" text DEFAULT 'local' NOT NULL,
	"cpu_percent" real NOT NULL,
	"cpu_cores" jsonb,
	"memory_used_mb" real NOT NULL,
	"memory_total_mb" real NOT NULL,
	"memory_available_mb" real NOT NULL,
	"swap_used_mb" real DEFAULT 0 NOT NULL,
	"swap_total_mb" real DEFAULT 0 NOT NULL,
	"disk_used_gb" real NOT NULL,
	"disk_total_gb" real NOT NULL,
	"disks" jsonb,
	"load_avg_1m" real NOT NULL,
	"load_avg_5m" real NOT NULL,
	"load_avg_15m" real NOT NULL,
	"network_rx_bytes" bigint DEFAULT 0 NOT NULL,
	"network_tx_bytes" bigint DEFAULT 0 NOT NULL,
	"top_processes" jsonb DEFAULT '[]'::jsonb,
	"collected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"monitor_id" uuid,
	"title" text NOT NULL,
	"status" text DEFAULT 'investigating' NOT NULL,
	"severity" text DEFAULT 'minor' NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "issue_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'error',
	"fingerprint" text NOT NULL,
	"status" text DEFAULT 'unresolved' NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"first_seen" timestamp DEFAULT now() NOT NULL,
	"last_seen" timestamp DEFAULT now() NOT NULL,
	"assigned_to" uuid,
	"environment" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"container_id" varchar(128) NOT NULL,
	"container_name" varchar(256) NOT NULL,
	"stream" varchar(8) NOT NULL,
	"message" text NOT NULL,
	"level" varchar(16),
	"timestamp" timestamp NOT NULL,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "maintenance_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"monitor_ids" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"config" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"tenant_id" text,
	"api_key" text,
	"api_key_hash" text,
	"key_prefix" text,
	"custom_domain" text,
	"logo_url" text,
	"description" text,
	"auto_resolve_on_deploy" boolean DEFAULT false,
	"api_role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version" text NOT NULL,
	"environment" text DEFAULT 'production' NOT NULL,
	"deployed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retention_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_name" text NOT NULL,
	"retention_days" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "retention_config_table_name_unique" UNIQUE("table_name")
);
--> statement-breakpoint
CREATE TABLE "saved_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"query" text NOT NULL,
	"filters" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"email" text NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "team_members_project_email_idx" UNIQUE("project_id","email")
);
--> statement-breakpoint
CREATE TABLE "traces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"trace_id" text NOT NULL,
	"span_id" text NOT NULL,
	"parent_span_id" text,
	"name" text NOT NULL,
	"kind" text,
	"status" text DEFAULT 'ok',
	"start_time" timestamp NOT NULL,
	"end_time" timestamp,
	"duration_ms" integer,
	"attributes" jsonb,
	"token_usage" jsonb,
	"model" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uptime_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"monitor_id" uuid NOT NULL,
	"status_code" integer,
	"cert_expiry" timestamp,
	"response_time_ms" integer NOT NULL,
	"error" text,
	"success" boolean NOT NULL,
	"checked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uptime_monitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"type" text DEFAULT 'http' NOT NULL,
	"monitor_group" text,
	"interval_seconds" integer DEFAULT 60 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"method" text DEFAULT 'GET',
	"headers" jsonb,
	"body" text,
	"auth_type" text,
	"auth_value" text,
	"ignore_ssl" boolean DEFAULT false,
	"max_redirects" integer DEFAULT 5,
	"keyword" text,
	"keyword_not" text,
	"dns_record_type" text,
	"dns_expected_value" text,
	"dns_resolver" text,
	"host" text,
	"port" integer,
	"tls" boolean DEFAULT false,
	"service_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fingerprint_rules" ADD CONSTRAINT "fingerprint_rules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_monitor_id_uptime_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."uptime_monitors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_assigned_to_team_members_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."team_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_config" ADD CONSTRAINT "notification_config_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_subscribers" ADD CONSTRAINT "status_subscribers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traces" ADD CONSTRAINT "traces_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_checks" ADD CONSTRAINT "uptime_checks_monitor_id_uptime_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."uptime_monitors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uptime_monitors" ADD CONSTRAINT "uptime_monitors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_history_alert_idx" ON "alert_history" USING btree ("alert_id");--> statement-breakpoint
CREATE INDEX "alert_history_time_idx" ON "alert_history" USING btree ("triggered_at");--> statement-breakpoint
CREATE INDEX "alerts_project_idx" ON "alerts" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "alerts_project_active_idx" ON "alerts" USING btree ("project_id","is_active");--> statement-breakpoint
CREATE INDEX "container_stats_id_idx" ON "container_stats" USING btree ("container_id");--> statement-breakpoint
CREATE INDEX "container_stats_time_idx" ON "container_stats" USING btree ("collected_at");--> statement-breakpoint
CREATE INDEX "container_stats_id_time_idx" ON "container_stats" USING btree ("container_id","collected_at");--> statement-breakpoint
CREATE INDEX "container_stats_host_idx" ON "container_stats" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "events_project_idx" ON "events" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "events_issue_idx" ON "events" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "events_created_idx" ON "events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "events_project_created_idx" ON "events" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "events_level_idx" ON "events" USING btree ("level");--> statement-breakpoint
CREATE INDEX "fingerprint_rules_project_idx" ON "fingerprint_rules" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "fingerprint_rules_active_idx" ON "fingerprint_rules" USING btree ("project_id","is_active");--> statement-breakpoint
CREATE INDEX "gpu_stats_host_time_idx" ON "gpu_stats" USING btree ("host_id","collected_at");--> statement-breakpoint
CREATE INDEX "host_info_host_idx" ON "host_info" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "host_stats_time_idx" ON "host_stats" USING btree ("collected_at");--> statement-breakpoint
CREATE INDEX "host_stats_host_idx" ON "host_stats" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "incidents_project_idx" ON "incidents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "incidents_status_idx" ON "incidents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "incidents_project_status_idx" ON "incidents" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "issue_comments_issue_idx" ON "issue_comments" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issue_comments_created_idx" ON "issue_comments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "issues_project_idx" ON "issues" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "issues_fingerprint_idx" ON "issues" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "issues_status_idx" ON "issues" USING btree ("status");--> statement-breakpoint
CREATE INDEX "issues_project_status_idx" ON "issues" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "logs_container_id_idx" ON "logs" USING btree ("container_id");--> statement-breakpoint
CREATE INDEX "logs_timestamp_idx" ON "logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "logs_container_timestamp_idx" ON "logs" USING btree ("container_id","timestamp");--> statement-breakpoint
CREATE INDEX "maintenance_windows_project_idx" ON "maintenance_windows" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "maintenance_windows_time_idx" ON "maintenance_windows" USING btree ("starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "notif_config_project_idx" ON "notification_config" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "notif_config_channel_idx" ON "notification_config" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "projects_key_prefix_idx" ON "projects" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX "projects_tenant_id_idx" ON "projects" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "releases_project_idx" ON "releases" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "releases_project_env_idx" ON "releases" USING btree ("project_id","environment");--> statement-breakpoint
CREATE INDEX "retention_config_table_idx" ON "retention_config" USING btree ("table_name");--> statement-breakpoint
CREATE INDEX "saved_searches_project_idx" ON "saved_searches" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "status_subscribers_project_idx" ON "status_subscribers" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "status_subscribers_email_idx" ON "status_subscribers" USING btree ("project_id","email");--> statement-breakpoint
CREATE INDEX "team_members_project_idx" ON "team_members" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "traces_project_idx" ON "traces" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "traces_trace_id_idx" ON "traces" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "traces_start_time_idx" ON "traces" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "traces_project_start_time_idx" ON "traces" USING btree ("project_id","start_time");--> statement-breakpoint
CREATE INDEX "traces_attributes_gin_idx" ON "traces" USING gin ("attributes");--> statement-breakpoint
CREATE INDEX "traces_total_tokens_idx" ON "traces" USING btree (CAST(("attributes"->>'gen_ai.usage.total_tokens') AS numeric));--> statement-breakpoint
CREATE INDEX "uptime_checks_monitor_idx" ON "uptime_checks" USING btree ("monitor_id");--> statement-breakpoint
CREATE INDEX "uptime_checks_time_idx" ON "uptime_checks" USING btree ("checked_at");--> statement-breakpoint
CREATE INDEX "uptime_checks_monitor_time_idx" ON "uptime_checks" USING btree ("monitor_id","checked_at");--> statement-breakpoint
CREATE INDEX "uptime_monitors_project_idx" ON "uptime_monitors" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "uptime_monitors_group_idx" ON "uptime_monitors" USING btree ("project_id","monitor_group");