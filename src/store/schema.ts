import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    // tenant_id is the external (admin-proxy / hiai-admin) identifier for the
    // tenant that owns this observe project. Convention: 1 tenant = 1 observe
    // project. Nullable so legacy projects continue to work; once admin-proxy
    // backfills, tenant_id becomes the canonical scope handle. Runtime query
    // routing (?tenantId= / ?tenant_id=) is handled by tenantScopePlugin and
    // maps onto project_id transparently — this column is for semantic
    // separation, not request routing.
    tenantId: text("tenant_id"),
    apiKey: text("api_key"), // DEPRECATED: kept for migration, will be removed after backfill
    apiKeyHash: text("api_key_hash"), // bcrypt hash of API key
    keyPrefix: text("key_prefix"), // first 8 chars of API key, for narrowing bcrypt lookups
    customDomain: text("custom_domain"),
    logoUrl: text("logo_url"),
    description: text("description"),
    autoResolveOnDeploy: boolean("auto_resolve_on_deploy").default(false),
    apiRole: text("api_role", { enum: ["admin", "member", "readonly"] })
      .default("member")
      .notNull(),
    // Per-project rate limit overrides. NULL (the default) means the global
    // path-based limits in src/middleware/rate-limiter.ts apply. When set,
    // the rate limiter uses these instead of the global default for the
    // matching path buckets. `rateLimit` is requests-per-window; `rateLimitWindowMs`
    // is the sliding window length in milliseconds (default 60_000 when null).
    // Both are nullable so the column add is non-breaking and existing
    // tenants retain the previous global behaviour automatically.
    rateLimit: integer("rate_limit"),
    rateLimitWindowMs: integer("rate_limit_window_ms"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("projects_key_prefix_idx").on(t.keyPrefix),
    index("projects_tenant_id_idx").on(t.tenantId),
  ],
);

export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: text("role").default("member").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at"),
  },
  (t) => [
    index("team_members_project_idx").on(t.projectId),
    unique("team_members_project_email_idx").on(t.projectId, t.email),
  ],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id)
      .notNull(),
    issueId: uuid("issue_id").references(() => issues.id),
    message: text("message"),
    exceptionType: text("exception_type"),
    stackTrace: text("stack_trace"),
    level: text("level").default("error"),
    tags: jsonb("tags").$type<Record<string, string>>(),
    // NOTE: `context` is jsonb (unbounded by Postgres type) but is HARD-CAPPED
    // at ~64 KB serialized JSON in src/api/sentry-ingest.ts (buildEventContext).
    // Do NOT write the full raw Sentry payload here — trim to triage fields
    // (tags, extra, user, contexts, breadcrumbs slice, last 50 stack frames)
    // and respect the 64 KB ceiling.
    context: jsonb("context").$type<Record<string, unknown>>(),
    fingerprint: text("fingerprint"),
    sdk: text("sdk"),
    environment: text("environment"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("events_project_idx").on(t.projectId),
    index("events_issue_idx").on(t.issueId),
    index("events_created_idx").on(t.createdAt),
    index("events_project_created_idx").on(t.projectId, t.createdAt),
    index("events_level_idx").on(t.level),
  ],
);

export const issues = pgTable(
  "issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id)
      .notNull(),
    title: text("title").notNull(),
    type: text("type").default("error"),
    fingerprint: text("fingerprint").notNull(),
    status: text("status").default("unresolved").notNull(),
    count: integer("count").default(1).notNull(),
    firstSeen: timestamp("first_seen").defaultNow().notNull(),
    lastSeen: timestamp("last_seen").defaultNow().notNull(),
    assignedTo: uuid("assigned_to").references(() => teamMembers.id, { onDelete: "set null" }),
    environment: text("environment"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (t) => [
    index("issues_project_idx").on(t.projectId),
    index("issues_fingerprint_idx").on(t.fingerprint),
    index("issues_status_idx").on(t.status),
    index("issues_project_status_idx").on(t.projectId, t.status),
  ],
);

export const traces = pgTable(
  "traces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id)
      .notNull(),
    traceId: text("trace_id").notNull(),
    spanId: text("span_id").notNull(),
    parentSpanId: text("parent_span_id"),
    name: text("name").notNull(),
    kind: text("kind"),
    status: text("status").default("ok"),
    startTime: timestamp("start_time").notNull(),
    endTime: timestamp("end_time"),
    durationMs: integer("duration_ms"),
    attributes: jsonb("attributes").$type<Record<string, unknown>>(),
    tokenUsage: jsonb("token_usage").$type<{ prompt: number; completion: number; total: number }>(),
    model: text("model"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("traces_project_idx").on(t.projectId),
    index("traces_trace_id_idx").on(t.traceId),
    index("traces_start_time_idx").on(t.startTime),
    index("traces_project_start_time_idx").on(t.projectId, t.startTime),
    index("traces_attributes_gin_idx").using("gin", t.attributes),
    index("traces_total_tokens_idx").on(
      sql`(${t.attributes}->>'gen_ai.usage.total_tokens')::numeric`,
    ),
  ],
);

export const uptimeMonitors = pgTable(
  "uptime_monitors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id)
      .notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    type: text("type").default("http").notNull(), // 'http' | 'tcp' | 'dns' | 'ping'
    monitorGroup: text("monitor_group"), // monitor group for organizing
    intervalSeconds: integer("interval_seconds").default(60).notNull(),
    active: boolean("active").default(true).notNull(),
    // HTTP check config
    method: text("method").default("GET"),
    headers: jsonb("headers").$type<Record<string, string>>(),
    body: text("body"),
    authType: text("auth_type"), // 'basic' | 'bearer'
    authValue: text("auth_value"),
    ignoreSsl: boolean("ignore_ssl").default(false),
    maxRedirects: integer("max_redirects").default(5),
    keyword: text("keyword"),
    keywordNot: text("keyword_not"),
    // DNS check config
    dnsRecordType: text("dns_record_type"), // 'A'|'AAAA'|'CNAME'|'MX'|'TXT'|'NS'
    dnsExpectedValue: text("dns_expected_value"),
    dnsResolver: text("dns_resolver"),
    // gRPC check config
    host: text("host"),
    port: integer("port"),
    tls: boolean("tls").default(false),
    serviceName: text("service_name"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at"),
  },
  (t) => [
    index("uptime_monitors_project_idx").on(t.projectId),
    index("uptime_monitors_group_idx").on(t.projectId, t.monitorGroup),
  ],
);

export const uptimeChecks = pgTable(
  "uptime_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    monitorId: uuid("monitor_id")
      .references(() => uptimeMonitors.id)
      .notNull(),
    statusCode: integer("status_code"),
    certExpiry: timestamp("cert_expiry"),
    responseTimeMs: integer("response_time_ms").notNull(),
    error: text("error"),
    success: boolean("success").notNull(),
    checkedAt: timestamp("checked_at").defaultNow().notNull(),
  },
  (t) => [
    index("uptime_checks_monitor_idx").on(t.monitorId),
    index("uptime_checks_time_idx").on(t.checkedAt),
    index("uptime_checks_monitor_time_idx").on(t.monitorId, t.checkedAt),
  ],
);

export const containerStats = pgTable(
  "container_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostId: text("host_id").default("local").notNull(),
    containerId: text("container_id").notNull(),
    name: text("name").notNull(),
    image: text("image").notNull(),
    cpuPercent: real("cpu_percent").notNull(),
    memoryUsageMb: real("memory_usage_mb").notNull(),
    memoryLimitMb: real("memory_limit_mb").notNull(),
    networkRxBytes: bigint("network_rx_bytes", { mode: "number" }).default(0).notNull(),
    networkTxBytes: bigint("network_tx_bytes", { mode: "number" }).default(0).notNull(),
    networkRxRate: bigint("network_rx_rate", { mode: "number" }).default(0).notNull(),
    networkTxRate: bigint("network_tx_rate", { mode: "number" }).default(0).notNull(),
    blockReadBytes: bigint("block_read_bytes", { mode: "number" }).default(0).notNull(),
    blockWriteBytes: bigint("block_write_bytes", { mode: "number" }).default(0).notNull(),
    memoryPercent: real("memory_percent").default(0).notNull(),
    restartCount: integer("restart_count").default(0).notNull(),
    healthStatus: text("health_status"),
    status: text("status").notNull(),
    uptimeSeconds: integer("uptime_seconds").default(0).notNull(),
    collectedAt: timestamp("collected_at").defaultNow().notNull(),
  },
  (t) => [
    index("container_stats_id_idx").on(t.containerId),
    index("container_stats_time_idx").on(t.collectedAt),
    index("container_stats_id_time_idx").on(t.containerId, t.collectedAt),
    index("container_stats_host_idx").on(t.hostId),
  ],
);

export interface TopProcess {
  pid: number;
  name: string;
  cpuPercent: number;
  memoryMb: number;
  state: string;
}

export const hostStats = pgTable(
  "host_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostId: text("host_id").default("local").notNull(),
    cpuPercent: real("cpu_percent").notNull(),
    cpuCores: jsonb("cpu_cores").$type<Array<{ core: number; percent: number }>>(),
    memoryUsedMb: real("memory_used_mb").notNull(),
    memoryTotalMb: real("memory_total_mb").notNull(),
    memoryAvailableMb: real("memory_available_mb").notNull(),
    swapUsedMb: real("swap_used_mb").default(0).notNull(),
    swapTotalMb: real("swap_total_mb").default(0).notNull(),
    diskUsedGb: real("disk_used_gb").notNull(),
    diskTotalGb: real("disk_total_gb").notNull(),
    disks: jsonb("disks").$type<Array<{ mount: string; usedGb: number; totalGb: number }>>(),
    loadAvg1m: real("load_avg_1m").notNull(),
    loadAvg5m: real("load_avg_5m").notNull(),
    loadAvg15m: real("load_avg_15m").notNull(),
    networkRxBytes: bigint("network_rx_bytes", { mode: "number" }).default(0).notNull(),
    networkTxBytes: bigint("network_tx_bytes", { mode: "number" }).default(0).notNull(),
    topProcesses: jsonb("top_processes").$type<TopProcess[]>().default([]),
    collectedAt: timestamp("collected_at").defaultNow().notNull(),
  },
  (t) => [
    index("host_stats_time_idx").on(t.collectedAt),
    index("host_stats_host_idx").on(t.hostId),
  ],
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id)
      .notNull(),
    name: text("name").notNull(),
    severity: text("severity").default("warning").notNull(), // "critical" | "warning" | "info"
    condition: jsonb("condition").$type<{
      type: string;
      operator: string;
      threshold: number;
      duration?: number;
    }>(),
    channels: jsonb("channels").$type<Array<{ type: string; target: string }>>(),
    isActive: boolean("is_active").default(true).notNull(),
    cooldownSeconds: integer("cooldown_seconds").default(300).notNull(),
    escalationMinutes: integer("escalation_minutes"), // re-notify after N minutes if still down
    lastTriggered: timestamp("last_triggered"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("alerts_project_idx").on(t.projectId),
    index("alerts_project_active_idx").on(t.projectId, t.isActive),
  ],
);

export const alertHistory = pgTable(
  "alert_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    alertId: uuid("alert_id")
      .references(() => alerts.id)
      .notNull(),
    triggeredAt: timestamp("triggered_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
    context: jsonb("context").$type<Record<string, unknown>>(),
  },
  (t) => [
    index("alert_history_alert_idx").on(t.alertId),
    index("alert_history_time_idx").on(t.triggeredAt),
  ],
);

export const logs = pgTable(
  "logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    containerId: varchar("container_id", { length: 128 }).notNull(),
    containerName: varchar("container_name", { length: 256 }).notNull(),
    stream: varchar("stream", { length: 8 }).notNull(),
    message: text("message").notNull(),
    level: varchar("level", { length: 16 }),
    timestamp: timestamp("timestamp", { mode: "date" }).notNull(),
    raw: jsonb("raw"),
  },
  (t) => [
    index("logs_container_id_idx").on(t.containerId),
    index("logs_timestamp_idx").on(t.timestamp),
    index("logs_container_timestamp_idx").on(t.containerId, t.timestamp),
  ],
);

export const notificationConfig = pgTable(
  "notification_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id)
      .notNull(),
    channel: text("channel").notNull(), // "telegram" | "discord" | "email"
    config: jsonb("config").$type<Record<string, string>>().notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at"),
  },
  (t) => [
    index("notif_config_project_idx").on(t.projectId),
    index("notif_config_channel_idx").on(t.channel),
  ],
);

export const retentionConfig = pgTable(
  "retention_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tableName: text("table_name").notNull().unique(),
    retentionDays: integer("retention_days").notNull().default(30),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at"),
  },
  (t) => [index("retention_config_table_idx").on(t.tableName)],
);

export const maintenanceWindows = pgTable(
  "maintenance_windows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id)
      .notNull(),
    name: text("name").notNull(),
    description: text("description"),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    monitorIds: jsonb("monitor_ids").$type<string[]>().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("maintenance_windows_project_idx").on(t.projectId),
    index("maintenance_windows_time_idx").on(t.startsAt, t.endsAt),
  ],
);

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id)
      .notNull(),
    monitorId: uuid("monitor_id").references(() => uptimeMonitors.id),
    title: text("title").notNull(),
    status: text("status").default("investigating").notNull(), // investigating, identified, monitoring, resolved
    severity: text("severity", { enum: ["minor", "major", "critical"] })
      .default("minor")
      .notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => [
    index("incidents_project_idx").on(t.projectId),
    index("incidents_status_idx").on(t.status),
    index("incidents_project_status_idx").on(t.projectId, t.status),
  ],
);

export const releases = pgTable(
  "releases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    version: text("version").notNull(),
    environment: text("environment").default("production").notNull(),
    deployedAt: timestamp("deployed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("releases_project_idx").on(t.projectId),
    index("releases_project_env_idx").on(t.projectId, t.environment),
  ],
);

export const issueComments = pgTable(
  "issue_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id")
      .references(() => issues.id, { onDelete: "cascade" })
      .notNull(),
    authorName: text("author_name").notNull(),
    // NOTE: `body` is text (unbounded by Postgres type) but is HARD-CAPPED at
    // 10_000 chars in src/api/comments.ts (MAX_COMMENT_BODY). The route-layer
    // validator is the only place this cap is enforced — do not bypass it.
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("issue_comments_issue_idx").on(t.issueId),
    index("issue_comments_created_idx").on(t.createdAt),
  ],
);

export const fingerprintRules = pgTable(
  "fingerprint_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    pattern: text("pattern").notNull(),
    groupBy: text("group_by"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("fingerprint_rules_project_idx").on(t.projectId),
    index("fingerprint_rules_active_idx").on(t.projectId, t.isActive),
  ],
);

export const savedSearches = pgTable(
  "saved_searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    query: text("query").notNull(),
    filters: jsonb("filters").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("saved_searches_project_idx").on(t.projectId)],
);

export const statusSubscribers = pgTable(
  "status_subscribers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    email: text("email").notNull(),
    isVerified: boolean("is_verified").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("status_subscribers_project_idx").on(t.projectId),
    index("status_subscribers_email_idx").on(t.projectId, t.email),
  ],
);

export const gpuStats = pgTable(
  "gpu_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostId: text("host_id").notNull(),
    gpuIndex: integer("gpu_index").notNull(),
    utilizationPercent: real("utilization_percent").notNull(),
    memoryUsedMb: real("memory_used_mb").notNull(),
    memoryTotalMb: real("memory_total_mb").notNull(),
    temperatureC: real("temperature_c"),
    collectedAt: timestamp("collected_at").defaultNow().notNull(),
  },
  (t) => [index("gpu_stats_host_time_idx").on(t.hostId, t.collectedAt)],
);

export const hostInfo = pgTable(
  "host_info",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostId: text("host_id").notNull().unique(),
    osName: text("os_name"),
    kernelVersion: text("kernel_version"),
    cpuModel: text("cpu_model"),
    coreCount: integer("core_count"),
    architecture: text("architecture"),
    uptimeSeconds: bigint("uptime_seconds", { mode: "number" }),
    collectedAt: timestamp("collected_at").defaultNow().notNull(),
  },
  (t) => [index("host_info_host_idx").on(t.hostId)],
);

export type LogEntry = typeof logs.$inferSelect;
export type NewLogEntry = typeof logs.$inferInsert;
