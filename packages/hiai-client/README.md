# @hiai-observe/client

TypeScript client SDK for [HiAi Observe](https://github.com/hiai/observe) — unified, self-hosted observability platform for AI Agents and TypeScript backends.

## Installation

```bash
bun add @hiai-observe/client
# or
npm install @hiai-observe/client
```

## Quick Start

```ts
import { HiaiClient } from "@hiai-observe/client";

const client = new HiaiClient({
  baseUrl: "http://localhost:8001",
  apiKey: "ho_your_api_key_here",
});
```

## Usage Examples

### Issues

```ts
// List unresolved issues
const { data: issues, total } = await client.issues.list({
  status: "unresolved",
  projectId: "550e8400-e29b-41d4-a716-446655440000",
  limit: 20,
});

// Get issue detail with recent events
const issue = await client.issues.get("issue-id");
console.log(issue.title, issue.events.length);

// Update issue status
await client.issues.update("issue-id", { status: "resolved" });

// Assign to team member
await client.issues.update("issue-id", { assignedTo: "member-id" });

// Merge duplicate issues
await client.issues.merge("target-id", ["source-1", "source-2"]);

// Comments
const comments = await client.issues.listComments("issue-id");
await client.issues.addComment("issue-id", {
  authorName: "Agent",
  body: "Investigating the root cause",
});
```

### Monitors

```ts
// List monitors with uptime
const { monitors } = await client.monitors.list({ project_id: "..." });
monitors.forEach((m) => console.log(`${m.name}: ${m.uptime24h}%`));

// Create a monitor
await client.monitors.create({
  name: "API Health",
  url: "https://api.example.com/health",
  project_id: "...",
  interval_seconds: 60,
});

// Update a monitor
await client.monitors.update("monitor-id", { active: false });

// Get check history
const checks = await client.monitors.checks("monitor-id", { limit: 50 });
```

### Alerts

```ts
// List alert rules
const { items: alerts } = await client.alerts.list();

// Create an alert
await client.alerts.create({
  name: "High Error Rate",
  projectId: "...",
  severity: "critical",
  condition: {
    type: "error_rate",
    operator: "gt",
    threshold: 10,
    duration: 300,
  },
  channels: [{ type: "telegram", target: "chat-id" }],
  cooldownSeconds: 600,
});

// Test a single alert
await client.alerts.test("alert-id");

// Test all active alerts
const result = await client.alerts.testAll();
console.log(result.message);

// Get alert history
const { items: history } = await client.alerts.history({ alertId: "alert-id" });
```

### Traces

```ts
// List traces
const { data: traces } = await client.traces.list({
  projectId: "...",
  status: "error",
  from: "2026-01-01T00:00:00Z",
});

// Get trace detail with span tree
const traceDetail = await client.traces.get("trace-id");

// Token usage and latency stats
const stats = await client.traces.stats("project-id", {
  from: "2026-01-01T00:00:00Z",
  groupBy: "model",
});

// Workflow runs
const workflows = await client.traces.workflows({ workflowName: "my-workflow" });
```

### Logs

```ts
// Search logs
const { data } = await client.logs.search({
  container: "my-app",
  level: "error",
  search: "connection timeout",
  limit: 100,
});

// Regex search
const regexResults = await client.logs.search({ regex: "ERR\\[\\d+\\]" });

// Log statistics
const stats = await client.logs.stats();
console.log(`${stats.total24h} logs in 24h`);

// List containers
const { data: containers } = await client.logs.containers();
```

### Dashboard

```ts
// Get aggregated dashboard data
const dash = await client.dashboard.get();
console.log(`Errors: ${dash.errorCount24h}, Uptime: ${dash.uptimePercent}%`);
console.log(`Active containers: ${dash.activeContainers}`);
```

### Releases

```ts
// List releases
const { data: releases } = await client.releases.list({
  projectId: "...",
  environment: "production",
});

// Create a release
const release = await client.releases.create({
  projectId: "...",
  version: "v2.1.0",
  environment: "production",
});

// Check release health
const health = await client.releases.health(release.id);
console.log(`Health: ${health.healthScore}, New issues: ${health.newIssuesCount}`);
```

### Team

```ts
// List team members
const { data: members } = await client.team.list({ projectId: "..." });

// Add team member
await client.team.create({
  projectId: "...",
  name: "Jane Doe",
  email: "jane@example.com",
  role: "admin",
});

// Update role
await client.team.update("member-id", { role: "viewer" });
```

### Maintenance Windows

```ts
// List active and upcoming
const { items } = await client.maintenance.list({ status: "active" });

// Get currently active windows
const { items: active } = await client.maintenance.activeNow();

// Create a maintenance window
await client.maintenance.create({
  projectId: "...",
  name: "Database migration",
  startsAt: "2026-06-01T02:00:00Z",
  endsAt: "2026-06-01T04:00:00Z",
  monitorIds: ["monitor-1", "monitor-2"],
});
```

### Incidents

```ts
// List active incidents
const { items } = await client.incidents.active();

// Create an incident
const incident = await client.incidents.create({
  projectId: "...",
  title: "Database connection failures",
});

// Update status through lifecycle
await client.incidents.update(incident.id, { status: "identified" });
await client.incidents.update(incident.id, { status: "monitoring" });
await client.incidents.update(incident.id, { status: "resolved" });
```

### Projects

```ts
// List projects
const { projects } = await client.projects.list();

// Create a project
const { project, apiKey } = await client.projects.create({ name: "My App" });
console.log(`New API key: ${apiKey}`);

// Rotate API key
const { apiKey: newKey } = await client.projects.rotateKey(project.id);
```

### Search

```ts
// Cross-project search
const results = await client.search.search("timeout error");
console.log(`Found ${results.issues.length} issues, ${results.traces.length} traces`);

// Scoped search
const scoped = await client.search.search("OOM", { projectId: "..." });
```

### Notifications

```ts
// List configured channels
const { notifications } = await client.notifications.list("project-id");

// Configure a channel
await client.notifications.upsert("telegram", {
  projectId: "...",
  config: { botToken: "...", chatId: "..." },
});

// Test a channel
const result = await client.notifications.test("telegram", "project-id");
```

## Error Handling

The SDK throws `HiaiError` for non-2xx responses:

```ts
import { HiaiClient, HiaiError } from "@hiai-observe/client";

try {
  await client.issues.get("non-existent-id");
} catch (err) {
  if (err instanceof HiaiError) {
    console.error(`Status: ${err.status}, Message: ${err.message}`);
    console.error("Response body:", err.body);
  }
}
```

## OpenAPI Spec

Fetch the OpenAPI specification directly from the server:

```ts
const spec = await client.openapi();
```

Or access it at `GET /api/openapi.json` (no auth required).

## License

MIT
