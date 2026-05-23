import { pgTable, text, integer, real, timestamp, uuid, varchar, jsonb, boolean, index } from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  apiKey: text("api_key").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id).notNull(),
  issueId: uuid("issue_id").references(() => issues.id),
  message: text("message"),
  exceptionType: text("exception_type"),
  stackTrace: text("stack_trace"),
  level: text("level").default("error"),
  tags: jsonb("tags").$type<Record<string, string>>(),
  context: jsonb("context").$type<Record<string, unknown>>(),
  fingerprint: text("fingerprint"),
  sdk: text("sdk"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("events_project_idx").on(t.projectId),
  index("events_issue_idx").on(t.issueId),
  index("events_created_idx").on(t.createdAt),
  index("events_project_created_idx").on(t.projectId, t.createdAt),
]);

export const issues = pgTable("issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id).notNull(),
  title: text("title").notNull(),
  type: text("type").default("error"),
  fingerprint: text("fingerprint").notNull(),
  status: text("status").default("unresolved").notNull(),
  count: integer("count").default(1).notNull(),
  firstSeen: timestamp("first_seen").defaultNow().notNull(),
  lastSeen: timestamp("last_seen").defaultNow().notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
}, (t) => [
  index("issues_project_idx").on(t.projectId),
  index("issues_fingerprint_idx").on(t.fingerprint),
  index("issues_status_idx").on(t.status),
  index("issues_project_status_idx").on(t.projectId, t.status),
]);

export const traces = pgTable("traces", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id).notNull(),
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
}, (t) => [
  index("traces_project_idx").on(t.projectId),
  index("traces_trace_id_idx").on(t.traceId),
  index("traces_start_time_idx").on(t.startTime),
  index("traces_project_start_time_idx").on(t.projectId, t.startTime),
]);

export const uptimeMonitors = pgTable("uptime_monitors", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id).notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  intervalSeconds: integer("interval_seconds").default(60).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
}, (t) => [
  index("uptime_monitors_project_idx").on(t.projectId),
]);

export const uptimeChecks = pgTable("uptime_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  monitorId: uuid("monitor_id").references(() => uptimeMonitors.id).notNull(),
  statusCode: integer("status_code"),
  responseTimeMs: integer("response_time_ms").notNull(),
  error: text("error"),
  success: boolean("success").notNull(),
  checkedAt: timestamp("checked_at").defaultNow().notNull(),
}, (t) => [
  index("uptime_checks_monitor_idx").on(t.monitorId),
  index("uptime_checks_time_idx").on(t.checkedAt),
]);

export const containerStats = pgTable("container_stats", {
  id: uuid("id").primaryKey().defaultRandom(),
  containerId: text("container_id").notNull(),
  name: text("name").notNull(),
  image: text("image").notNull(),
  cpuPercent: real("cpu_percent").notNull(),
  memoryUsageMb: real("memory_usage_mb").notNull(),
  memoryLimitMb: real("memory_limit_mb").notNull(),
  networkRxBytes: integer("network_rx_bytes").default(0).notNull(),
  networkTxBytes: integer("network_tx_bytes").default(0).notNull(),
  blockReadBytes: integer("block_read_bytes").default(0).notNull(),
  blockWriteBytes: integer("block_write_bytes").default(0).notNull(),
  status: text("status").notNull(),
  uptimeSeconds: integer("uptime_seconds").default(0).notNull(),
  collectedAt: timestamp("collected_at").defaultNow().notNull(),
}, (t) => [
  index("container_stats_id_idx").on(t.containerId),
  index("container_stats_time_idx").on(t.collectedAt),
  index("container_stats_id_time_idx").on(t.containerId, t.collectedAt),
]);

export const hostStats = pgTable("host_stats", {
  id: uuid("id").primaryKey().defaultRandom(),
  cpuPercent: real("cpu_percent").notNull(),
  memoryUsedMb: real("memory_used_mb").notNull(),
  memoryTotalMb: real("memory_total_mb").notNull(),
  memoryAvailableMb: real("memory_available_mb").notNull(),
  diskUsedGb: real("disk_used_gb").notNull(),
  diskTotalGb: real("disk_total_gb").notNull(),
  loadAvg1m: real("load_avg_1m").notNull(),
  loadAvg5m: real("load_avg_5m").notNull(),
  loadAvg15m: real("load_avg_15m").notNull(),
  collectedAt: timestamp("collected_at").defaultNow().notNull(),
}, (t) => [
  index("host_stats_time_idx").on(t.collectedAt),
]);

export const alerts = pgTable("alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id).notNull(),
  name: text("name").notNull(),
  condition: jsonb("condition").$type<{ type: string; operator: string; threshold: number; duration?: number }>(),
  channels: jsonb("channels").$type<Array<{ type: string; target: string }>>(),
  isActive: boolean("is_active").default(true).notNull(),
  cooldownSeconds: integer("cooldown_seconds").default(300).notNull(),
  lastTriggered: timestamp("last_triggered"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("alerts_project_idx").on(t.projectId),
  index("alerts_project_active_idx").on(t.projectId, t.isActive),
]);

export const alertHistory = pgTable("alert_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  alertId: uuid("alert_id").references(() => alerts.id).notNull(),
  triggeredAt: timestamp("triggered_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
  context: jsonb("context").$type<Record<string, unknown>>(),
}, (t) => [
  index("alert_history_alert_idx").on(t.alertId),
  index("alert_history_time_idx").on(t.triggeredAt),
]);

export const logs = pgTable("logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  containerId: varchar("container_id", { length: 128 }).notNull(),
  containerName: varchar("container_name", { length: 256 }).notNull(),
  stream: varchar("stream", { length: 8 }).notNull(),
  message: text("message").notNull(),
  level: varchar("level", { length: 16 }),
  timestamp: timestamp("timestamp", { mode: "date" }).notNull(),
  raw: jsonb("raw"),
}, (t) => [
  index("logs_container_id_idx").on(t.containerId),
  index("logs_timestamp_idx").on(t.timestamp),
  index("logs_container_timestamp_idx").on(t.containerId, t.timestamp),
]);

export type LogEntry = typeof logs.$inferSelect;
export type NewLogEntry = typeof logs.$inferInsert;
