/**
 * Comprehensive demo data seeder for HiAi Observe.
 * Run: bun run scripts/seed-demo.ts
 */

import { db } from "../src/store/db.js";
import {
  projects, issues, events, uptimeMonitors, uptimeChecks,
  alerts, alertHistory, traces, logs, hostStats, containerStats,
} from "../src/store/schema.js";
import { randomUUID } from "crypto";

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randFloat(min: number, max: number, d = 2) { return parseFloat((Math.random() * (max - min) + min).toFixed(d)); }
function hoursAgo(h: number) { return new Date(Date.now() - h * 3600000); }
function minsAgo(m: number) { return new Date(Date.now() - m * 60000); }
function uuid() { return randomUUID(); }
function hex16() { return randomUUID().replace(/-/g, "").slice(0, 16); }
function hex32() { return randomUUID().replace(/-/g, "").slice(0, 32); }

async function seed() {
  console.log("Seeding HiAi Observe demo data...\n");

  // Clean existing data (order matters for FK)
  for (const table of [alertHistory, logs, hostStats, containerStats, alerts, traces, uptimeChecks, uptimeMonitors, events, issues, projects]) {
    await db.delete(table);
  }

  // ── Project ──────────────────────────────────────────────────────────────
  const pid = uuid();
  const apiKey = `ho_${randomUUID().replace(/-/g, "")}`;
  await db.insert(projects).values({ id: pid, name: "Demo App", slug: "demo", apiKey });
  console.log(`  Project: Demo App (${pid})`);
  console.log(`  API Key: ${apiKey}\n`);

  // ── Issues (10) ──────────────────────────────────────────────────────────
  const issueDefs = [
    { title: "TypeError: Cannot read property 'id' of undefined", fp: "TypeError:read_property_id", status: "unresolved", count: 47 },
    { title: "NetworkError: Failed to fetch — ECONNREFUSED", fp: "NetworkError:ECONNREFUSED", status: "unresolved", count: 12 },
    { title: "RangeError: Maximum call stack size exceeded", fp: "RangeError:stack_overflow", status: "resolved", count: 3 },
    { title: "Database connection timeout after 30s", fp: "DB:connection_timeout", status: "unresolved", count: 8 },
    { title: "Unhandled promise rejection in auth middleware", fp: "UnhandledRejection:auth", status: "ignored", count: 156 },
    { title: "SyntaxError: Unexpected token '<' (JSON.parse)", fp: "SyntaxError:json_html", status: "unresolved", count: 19 },
    { title: "PrismaClientKnownRequestError: Unique constraint", fp: "Prisma:unique_constraint", status: "ignored", count: 56 },
    { title: "AggregateError: All promises rejected", fp: "AggregateError:all_rejected", status: "unresolved", count: 12 },
    { title: "Error: Rate limit exceeded (OpenAI 429)", fp: "Error:rate_limit_openai", status: "unresolved", count: 41 },
    { title: "TypeError: Assignment to constant variable", fp: "TypeError:const_assign", status: "resolved", count: 31 },
  ];

  const iids: string[] = [];
  for (const d of issueDefs) {
    const id = uuid();
    iids.push(id);
    await db.insert(issues).values({
      id, projectId: pid, title: d.title, type: "error", fingerprint: d.fp,
      status: d.status, count: d.count,
      firstSeen: new Date(Date.now() - randInt(1, 7) * 86400000),
      lastSeen: minsAgo(randInt(5, 120)),
      metadata: { source: "sentry-sdk", environment: "production" },
    });
  }
  console.log(`  Issues: ${iids.length}`);

  // ── Events (30) ──────────────────────────────────────────────────────────
  const exTypes = ["TypeError", "NetworkError", "RangeError", "SyntaxError", "Error"];
  const sdkVersions = ["@sentry/node@8.5.0", "@sentry/browser@8.5.0", "@hiai-observe/mastra@0.1.0"];

  for (let i = 0; i < 30; i++) {
    const idx = i % iids.length;
    await db.insert(events).values({
      projectId: pid, issueId: iids[idx],
      message: issueDefs[idx].title.split(":")[1]?.trim() ?? "Unknown error",
      exceptionType: exTypes[idx % exTypes.length],
      stackTrace: `${exTypes[idx % exTypes.length]}: error at /app/src/handler.ts:${42 + i}:18\n    at process (/app/src/middleware.ts:18:5)\n    at elysia (node_modules/elysia/src/index.ts:312:24)`,
      level: i % 5 === 0 ? "warning" : "error",
      tags: { environment: pick(["production", "staging"]), region: pick(["us-east-1", "eu-west-1"]), version: `1.${randInt(0, 9)}.${randInt(0, 15)}` },
      context: { user: { id: `user_${randInt(1000, 9999)}` }, request: { method: "POST", url: "/api/users" } },
      fingerprint: issueDefs[idx].fp,
      sdk: sdkVersions[i % sdkVersions.length],
      createdAt: minsAgo(randInt(0, 1440)),
    });
  }
  console.log(`  Events: 30`);

  // ── Uptime Monitors (3) + Checks (48h history) ──────────────────────────
  const monitors = [
    { name: "API Server", url: "https://api.example.com/health", interval: 60 },
    { name: "Web Frontend", url: "https://www.example.com", interval: 120 },
    { name: "Database Proxy", url: "https://db.example.com/ping", interval: 30 },
  ];
  let totalChecks = 0;
  for (const m of monitors) {
    const mid = uuid();
    await db.insert(uptimeMonitors).values({ id: mid, projectId: pid, name: m.name, url: m.url, intervalSeconds: m.interval, active: true });
    const n = Math.floor(48 * (3600 / m.interval));
    const rows: Array<{ monitorId: string; statusCode: number; responseTimeMs: number; error: string | null; success: boolean; checkedAt: Date }> = [];
    for (let i = 0; i < n; i++) {
      const ok = Math.random() > 0.02;
      rows.push({
        monitorId: mid, statusCode: ok ? 200 : pick([500, 502, 503, 408, 0]),
        responseTimeMs: ok ? randInt(15, 350) : randInt(1000, 10000),
        error: ok ? null : pick(["ECONNREFUSED", "ETIMEDOUT", "Internal Server Error"]),
        success: ok, checkedAt: minsAgo(i * (m.interval / 60)),
      });
    }
    for (let i = 0; i < rows.length; i += 500) {
      await db.insert(uptimeChecks).values(rows.slice(i, i + 500));
    }
    totalChecks += n;
  }
  console.log(`  Uptime: 3 monitors, ${totalChecks} checks`);

  // ── Alerts (5) ──────────────────────────────────────────────────────────
  const alertDefs = [
    { name: "High Error Rate", condition: { type: "error_rate", operator: "gt", threshold: 10, duration: 300 }, channels: [{ type: "telegram", target: "123456789" }], active: true, cooldown: 300 },
    { name: "API Down", condition: { type: "uptime_down", operator: "eq", threshold: 1, consecutiveFailures: 3 }, channels: [{ type: "telegram", target: "123456789" }, { type: "discord", target: "https://discord.webhook/abc" }], active: true, cooldown: 600 },
    { name: "High CPU Usage", condition: { type: "resource_threshold", operator: "gt", threshold: 90, resource: "cpu" }, channels: [{ type: "email", target: "ops@example.com" }], active: true, cooldown: 900 },
    { name: "High Memory Usage", condition: { type: "resource_threshold", operator: "gt", threshold: 85, resource: "memory" }, channels: [{ type: "email", target: "ops@example.com" }], active: true, cooldown: 600 },
    { name: "Token Usage Spike", condition: { type: "token_usage", operator: "gt", threshold: 100000 }, channels: [{ type: "telegram", target: "123456789" }], active: false, cooldown: 3600 },
  ];
  const aids: string[] = [];
  for (const a of alertDefs) {
    const id = uuid();
    aids.push(id);
    await db.insert(alerts).values({ id, projectId: pid, name: a.name, condition: a.condition, channels: a.channels, isActive: a.active, cooldownSeconds: a.cooldown });
  }
  // Add some alert history
  for (let i = 0; i < 5; i++) {
    await db.insert(alertHistory).values({ alertId: aids[i % aids.length], triggeredAt: minsAgo(randInt(60, 2880)), context: { value: randInt(5, 50) } });
  }
  console.log(`  Alerts: ${alertDefs.length} rules, 5 history entries`);

  // ── Traces (100 workflows, ~300 spans) ──────────────────────────────────
  const wfNames = ["generate-article", "summarize-docs", "chat-completion", "code-review", "translate-text"];
  const toolNames = ["web-search", "calculator", "code-executor", "file-reader", "database-query"];
  const agentNames = ["researcher", "writer", "reviewer", "translator", "coder"];
  const models = ["gpt-4o", "claude-3.5-sonnet", "gemini-2.0-flash", "gpt-4o-mini"];

  let spanCount = 0;
  for (let i = 0; i < 100; i++) {
    const tid = hex32();
    const wf = pick(wfNames);
    const model = pick(models);
    const start = hoursAgo(randInt(0, 48));
    const dur = randInt(500, 30000);
    const end = new Date(start.getTime() + dur);
    const err = Math.random() < 0.08;
    const pTokens = randInt(100, 4000);
    const cTokens = randInt(50, 2000);

    await db.insert(traces).values({
      projectId: pid, traceId: tid, spanId: hex16(), parentSpanId: null,
      name: wf, kind: "INTERNAL", status: err ? "ERROR" : "OK",
      startTime: start, endTime: end, durationMs: dur,
      attributes: { "mastra.workflow": wf, "mastra.version": "1.36.0" },
      tokenUsage: { prompt: pTokens, completion: cTokens, total: pTokens + cTokens },
      model,
    });

    const tc = randInt(1, 3);
    for (let j = 0; j < tc; j++) {
      const td = randInt(50, Math.floor(dur / tc));
      const ts = new Date(start.getTime() + j * Math.floor(dur / tc));
      await db.insert(traces).values({
        projectId: pid, traceId: tid, spanId: hex16(), parentSpanId: null,
        name: pick(toolNames), kind: "CLIENT",
        status: Math.random() < 0.05 ? "ERROR" : "OK",
        startTime: ts, endTime: new Date(ts.getTime() + td), durationMs: td,
        attributes: { "mastra.tool": pick(toolNames) },
        tokenUsage: null, model: null,
      });
    }

    await db.insert(traces).values({
      projectId: pid, traceId: tid, spanId: hex16(), parentSpanId: null,
      name: pick(agentNames), kind: "INTERNAL", status: "OK",
      startTime: start, endTime: end, durationMs: randInt(200, Math.floor(dur / 2)),
      attributes: { "mastra.agent": pick(agentNames), "gen_ai.request.model": model },
      tokenUsage: { prompt: pTokens, completion: cTokens, total: pTokens + cTokens },
      model,
    });

    spanCount += 2 + tc;
  }
  console.log(`  Traces: ${spanCount} spans across 100 workflows`);

  // ── Logs (500) ──────────────────────────────────────────────────────────
  const ctrs = [
    { id: "api-server", name: "hiai-api" },
    { id: "web-frontend", name: "hiai-web" },
    { id: "postgres", name: "hiai-postgres" },
    { id: "redis", name: "hiai-redis" },
    { id: "worker", name: "hiai-worker" },
  ];
  const msgs = [
    "Request handled successfully in 23ms",
    "Database query executed: SELECT * FROM users",
    "User authentication successful for user-1234",
    "Cache miss for key: session:abc123",
    "Background job completed: sync-cron",
    "WebSocket connection established from 10.0.0.5",
    "Rate limit approaching threshold: 80%",
    "Slow query detected: 250ms on users table",
    "Connection pool: 8/20 active connections",
    "Health check passed",
    "Memory usage: 1.8GB / 4GB",
    "Error: Connection reset by peer",
    "Warning: High memory usage detected at 85%",
    "Retry attempt 2/3 for upstream call",
    "Metrics exported to observability backend",
    "Graceful shutdown initiated by SIGTERM",
  ];
  const logBatch: Array<{ containerId: string; containerName: string; stream: string; message: string; level: string; timestamp: Date }> = [];
  for (let i = 0; i < 500; i++) {
    const c = pick(ctrs);
    const lvl = pick(["info", "info", "info", "warn", "error", "debug"]);
    logBatch.push({
      containerId: c.id, containerName: c.name,
      stream: lvl === "error" ? "stderr" : "stdout",
      message: pick(msgs), level: lvl,
      timestamp: minsAgo(randInt(0, 2880)),
    });
  }
  for (let i = 0; i < logBatch.length; i += 200) {
    await db.insert(logs).values(logBatch.slice(i, i + 200));
  }
  console.log(`  Logs: 500 entries`);

  // ── Host Stats (48h hourly) ─────────────────────────────────────────────
  const hRows: Array<{ cpuPercent: number; memoryUsedMb: number; memoryTotalMb: number; memoryAvailableMb: number; diskUsedGb: number; diskTotalGb: number; loadAvg1m: number; loadAvg5m: number; loadAvg15m: number; collectedAt: Date }> = [];
  for (let i = 0; i < 48; i++) {
    const h = new Date(Date.now() - i * 3600000).getHours();
    const mul = h >= 9 && h <= 17 ? 1.5 : 0.7;
    hRows.push({
      cpuPercent: randFloat(5 * mul, 45 * mul),
      memoryUsedMb: randFloat(1200, 3200), memoryTotalMb: 4096, memoryAvailableMb: randFloat(800, 2800),
      diskUsedGb: randFloat(120, 180), diskTotalGb: 500,
      loadAvg1m: randFloat(0.2 * mul, 2.5 * mul),
      loadAvg5m: randFloat(0.3 * mul, 2.0 * mul),
      loadAvg15m: randFloat(0.4 * mul, 1.8 * mul),
      collectedAt: hoursAgo(i),
    });
  }
  await db.insert(hostStats).values(hRows);
  console.log(`  Host Stats: ${hRows.length} hourly snapshots`);

  console.log(`\nDone! Total: 10 issues, 30 events, 3 monitors, ${totalChecks} checks, 5 alerts, ${spanCount} trace spans, 500 logs, ${hRows.length} host stats.`);
  console.log(`\n  API Key: ${apiKey}`);
  console.log(`  Project: ${pid}`);
  console.log(`  URL:     http://localhost:8001`);
}

seed().then(() => process.exit(0)).catch((err) => { console.error("Seed failed:", err); process.exit(1); });
