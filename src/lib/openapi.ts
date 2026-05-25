/**
 * OpenAPI 3.0 specification for HiAi Observe.
 *
 * Served as a public JSON endpoint at GET /api/openapi.json (no auth required).
 */
import { Elysia } from "elysia";

function buildSchemas(): Record<string, unknown> {
  return {
    Error: {
      type: "object",
      properties: { error: { type: "string" }, detail: { type: "string" } },
      required: ["error"],
    },
    PaginatedMeta: {
      type: "object",
      properties: {
        total: { type: "integer" },
        limit: { type: "integer" },
        offset: { type: "integer" },
      },
    },
    Project: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string" },
        slug: { type: "string" },
        description: { type: "string", nullable: true },
        logoUrl: { type: "string", nullable: true },
        customDomain: { type: "string", nullable: true },
        autoResolveOnDeploy: { type: "boolean" },
        createdAt: { type: "string", format: "date-time" },
      },
    },
    ProjectCreate: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string", minLength: 1, maxLength: 100 } },
    },
    Issue: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        projectId: { type: "string", format: "uuid" },
        title: { type: "string" },
        type: { type: "string", enum: ["error", "warning", "info"] },
        fingerprint: { type: "string" },
        status: { type: "string", enum: ["unresolved", "resolved", "ignored"] },
        count: { type: "integer" },
        firstSeen: { type: "string", format: "date-time" },
        lastSeen: { type: "string", format: "date-time" },
        assignedTo: { type: "string", format: "uuid", nullable: true },
        environment: { type: "string", nullable: true },
        metadata: { type: "object", nullable: true },
      },
    },
    IssueUpdate: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["unresolved", "resolved", "ignored"] },
        assignedTo: { type: "string", format: "uuid", nullable: true },
      },
    },
    IssueMerge: {
      type: "object",
      required: ["targetIssueId", "sourceIssueIds"],
      properties: {
        targetIssueId: { type: "string", format: "uuid" },
        sourceIssueIds: { type: "array", items: { type: "string", format: "uuid" }, minItems: 1 },
      },
    },
    Event: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        projectId: { type: "string", format: "uuid" },
        issueId: { type: "string", format: "uuid", nullable: true },
        message: { type: "string", nullable: true },
        exceptionType: { type: "string", nullable: true },
        stackTrace: { type: "string", nullable: true },
        level: { type: "string" },
        tags: { type: "object", nullable: true },
        context: { type: "object", nullable: true },
        fingerprint: { type: "string", nullable: true },
        sdk: { type: "string", nullable: true },
        environment: { type: "string", nullable: true },
        createdAt: { type: "string", format: "date-time" },
      },
    },
    Monitor: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        projectId: { type: "string", format: "uuid" },
        name: { type: "string" },
        url: { type: "string", format: "uri" },
        type: { type: "string", enum: ["http", "tcp", "dns", "ping"] },
        monitorGroup: { type: "string", nullable: true },
        intervalSeconds: { type: "integer" },
        active: { type: "boolean" },
        method: { type: "string", nullable: true },
        ignoreSsl: { type: "boolean" },
        maxRedirects: { type: "integer" },
        keyword: { type: "string", nullable: true },
        uptime24h: { type: "number", nullable: true },
        createdAt: { type: "string", format: "date-time" },
      },
    },
    MonitorCreate: {
      type: "object",
      required: ["name", "url", "project_id"],
      properties: {
        name: { type: "string", minLength: 1 },
        url: { type: "string", format: "uri" },
        type: { type: "string" },
        group: { type: "string" },
        interval_seconds: { type: "integer", minimum: 10 },
        project_id: { type: "string" },
        method: { type: "string" },
        headers: { type: "object", additionalProperties: { type: "string" } },
        body: { type: "string" },
        ignore_ssl: { type: "boolean" },
        max_redirects: { type: "integer", minimum: 0, maximum: 20 },
        keyword: { type: "string" },
      },
    },
    MonitorUpdate: {
      type: "object",
      properties: {
        name: { type: "string" },
        url: { type: "string", format: "uri" },
        interval_seconds: { type: "integer", minimum: 10 },
        active: { type: "boolean" },
        method: { type: "string" },
        ignore_ssl: { type: "boolean" },
        keyword: { type: "string" },
      },
    },
    AlertCondition: {
      type: "object",
      required: ["type", "threshold", "operator"],
      properties: {
        type: { type: "string", enum: ["error_rate", "uptime_down", "resource_threshold", "trace_error", "token_usage"] },
        threshold: { type: "number" },
        duration: { type: "number" },
        operator: { type: "string", enum: ["gt", "lt", "eq", "gte", "lte"] },
        consecutiveFailures: { type: "number" },
        resource: { type: "string", enum: ["cpu", "memory", "disk"] },
        model: { type: "string" },
      },
    },
    AlertChannel: {
      type: "object",
      required: ["type", "target"],
      properties: {
        type: { type: "string", enum: ["telegram", "discord", "email", "slack", "webhook", "pagerduty", "teams", "ntfy", "gotify", "pushover"] },
        target: { type: "string" },
      },
    },
    Alert: {
      type: "object",
      properties: {
        id: { type: "string" },
        projectId: { type: "string", format: "uuid" },
        name: { type: "string" },
        severity: { type: "string", enum: ["critical", "warning", "info"] },
        condition: { $ref: "#/components/schemas/AlertCondition" },
        channels: { type: "array", items: { $ref: "#/components/schemas/AlertChannel" } },
        isActive: { type: "boolean" },
        cooldownSeconds: { type: "integer" },
        lastTriggered: { type: "string", format: "date-time", nullable: true },
        createdAt: { type: "string", format: "date-time" },
      },
    },
    AlertCreate: {
      type: "object",
      required: ["name", "projectId", "condition", "channels"],
      properties: {
        name: { type: "string", minLength: 1 },
        projectId: { type: "string" },
        severity: { type: "string", enum: ["critical", "warning", "info"] },
        condition: { $ref: "#/components/schemas/AlertCondition" },
        channels: { type: "array", items: { $ref: "#/components/schemas/AlertChannel" } },
        cooldownSeconds: { type: "integer", minimum: 60 },
      },
    },
    AlertUpdate: {
      type: "object",
      properties: {
        name: { type: "string" },
        severity: { type: "string", enum: ["critical", "warning", "info"] },
        condition: { type: "object" },
        channels: { type: "array", items: { type: "object" } },
        isActive: { type: "boolean" },
        cooldownSeconds: { type: "integer" },
      },
    },
    AlertHistory: {
      type: "object",
      properties: {
        id: { type: "string" },
        alertId: { type: "string" },
        triggeredAt: { type: "string", format: "date-time" },
        resolvedAt: { type: "string", format: "date-time", nullable: true },
        context: { type: "object", nullable: true },
      },
    },
    Trace: {
      type: "object",
      properties: {
        id: { type: "string" },
        projectId: { type: "string", format: "uuid" },
        traceId: { type: "string" },
        spanId: { type: "string" },
        parentSpanId: { type: "string", nullable: true },
        name: { type: "string" },
        kind: { type: "string", nullable: true },
        status: { type: "string" },
        startTime: { type: "string", format: "date-time" },
        endTime: { type: "string", format: "date-time", nullable: true },
        durationMs: { type: "integer", nullable: true },
        attributes: { type: "object", nullable: true },
        tokenUsage: {
          type: "object",
          nullable: true,
          properties: { prompt: { type: "integer" }, completion: { type: "integer" }, total: { type: "integer" } },
        },
        model: { type: "string", nullable: true },
        createdAt: { type: "string", format: "date-time" },
      },
    },
    LogEntry: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        containerId: { type: "string" },
        containerName: { type: "string" },
        stream: { type: "string" },
        message: { type: "string" },
        level: { type: "string", nullable: true },
        timestamp: { type: "string", format: "date-time" },
      },
    },
    Release: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        projectId: { type: "string", format: "uuid" },
        version: { type: "string" },
        environment: { type: "string", enum: ["production", "staging", "development"] },
        deployedAt: { type: "string", format: "date-time", nullable: true },
        createdAt: { type: "string", format: "date-time" },
      },
    },
    ReleaseCreate: {
      type: "object",
      required: ["projectId", "version"],
      properties: {
        projectId: { type: "string", format: "uuid" },
        version: { type: "string", minLength: 1 },
        environment: { type: "string", enum: ["production", "staging", "development"] },
        deployedAt: { type: "string", format: "date-time" },
      },
    },
    ReleaseHealth: {
      type: "object",
      properties: {
        releaseId: { type: "string", format: "uuid" },
        version: { type: "string" },
        environment: { type: "string" },
        newIssuesCount: { type: "integer" },
        errorRate: { type: "number" },
        healthScore: { type: "string", enum: ["green", "yellow", "red"] },
        windowHours: { type: "number" },
      },
    },
    TeamMember: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        projectId: { type: "string", format: "uuid" },
        name: { type: "string" },
        email: { type: "string", format: "email" },
        role: { type: "string", enum: ["owner", "admin", "member", "viewer"] },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time", nullable: true },
      },
    },
    TeamMemberCreate: {
      type: "object",
      required: ["projectId", "name", "email"],
      properties: {
        projectId: { type: "string", format: "uuid" },
        name: { type: "string", minLength: 1 },
        email: { type: "string", format: "email" },
        role: { type: "string", enum: ["owner", "admin", "member", "viewer"] },
      },
    },
    TeamMemberUpdate: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1 },
        email: { type: "string", format: "email" },
        role: { type: "string", enum: ["owner", "admin", "member", "viewer"] },
      },
    },
    Comment: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        issueId: { type: "string", format: "uuid" },
        authorName: { type: "string" },
        body: { type: "string" },
        createdAt: { type: "string", format: "date-time" },
      },
    },
    CommentCreate: {
      type: "object",
      required: ["authorName", "body"],
      properties: { authorName: { type: "string", minLength: 1 }, body: { type: "string", minLength: 1 } },
    },
    MaintenanceWindow: {
      type: "object",
      properties: {
        id: { type: "string" },
        projectId: { type: "string" },
        name: { type: "string" },
        description: { type: "string", nullable: true },
        startsAt: { type: "string", format: "date-time" },
        endsAt: { type: "string", format: "date-time" },
        monitorIds: { type: "array", items: { type: "string" } },
        createdAt: { type: "string", format: "date-time" },
      },
    },
    MaintenanceWindowCreate: {
      type: "object",
      required: ["projectId", "name", "startsAt", "endsAt"],
      properties: {
        projectId: { type: "string" },
        name: { type: "string", minLength: 1 },
        description: { type: "string" },
        startsAt: { type: "string", format: "date-time" },
        endsAt: { type: "string", format: "date-time" },
        monitorIds: { type: "array", items: { type: "string" } },
      },
    },
    MaintenanceWindowUpdate: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1 },
        description: { type: "string" },
        startsAt: { type: "string", format: "date-time" },
        endsAt: { type: "string", format: "date-time" },
        monitorIds: { type: "array", items: { type: "string" } },
      },
    },
    Incident: {
      type: "object",
      properties: {
        id: { type: "string" },
        projectId: { type: "string" },
        monitorId: { type: "string", nullable: true },
        title: { type: "string" },
        status: { type: "string", enum: ["investigating", "identified", "monitoring", "resolved"] },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
        resolvedAt: { type: "string", format: "date-time", nullable: true },
      },
    },
    IncidentCreate: {
      type: "object",
      required: ["projectId", "title"],
      properties: {
        projectId: { type: "string" },
        monitorId: { type: "string" },
        title: { type: "string", minLength: 1 },
        status: { type: "string", enum: ["investigating", "identified", "monitoring", "resolved"] },
      },
    },
    IncidentUpdate: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1 },
        status: { type: "string", enum: ["investigating", "identified", "monitoring", "resolved"] },
        monitorId: { type: "string" },
      },
    },
    Dashboard: {
      type: "object",
      properties: {
        errorCount24h: { type: "integer" },
        uptimePercent: { type: "number" },
        activeContainers: { type: "integer" },
        traceCount24h: { type: "integer" },
        recentIssues: { type: "array", items: { type: "object" } },
        monitorStatuses: { type: "array", items: { type: "object" } },
        alertCount: { type: "integer" },
        errorBuckets: { type: "array", items: { type: "object" } },
        traceBuckets: { type: "array", items: { type: "object" } },
      },
    },
    NotificationConfig: {
      type: "object",
      properties: {
        id: { type: "string" },
        projectId: { type: "string" },
        channel: { type: "string" },
        config: { type: "object", additionalProperties: { type: "string" } },
        enabled: { type: "boolean" },
        configured: { type: "boolean" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time", nullable: true },
      },
    },
  };
}

function buildPaths(): Record<string, unknown> {
  const param = (name: string, where: string, schema: Record<string, unknown>, required = false) => ({ name, in: where, required, schema });
  const queryStr = (name: string) => param(name, "query", { type: "string" });
  const queryUuid = (name: string) => param(name, "query", { type: "string", format: "uuid" });
  const pathId = param("id", "path", { type: "string" }, true);
  const pathUuid = param("id", "path", { type: "string", format: "uuid" }, true);

  return {
    // Health
    "/health": { get: { tags: ["Health"], summary: "Health check", security: [], responses: { 200: { description: "Service healthy" } } } },
    "/metrics": { get: { tags: ["Health"], summary: "Prometheus metrics", security: [], responses: { 200: { description: "Prometheus format metrics" } } } },

    // Projects
    "/api/projects": {
      get: { tags: ["Projects"], summary: "List all projects", responses: { 200: { description: "List of projects" } } },
      post: { tags: ["Projects"], summary: "Create a project", requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/ProjectCreate" } } } }, responses: { 201: { description: "Project created" } } },
    },
    "/api/projects/{id}": {
      delete: { tags: ["Projects"], summary: "Delete a project and all its data", parameters: [pathUuid], responses: { 200: { description: "Project deleted" }, 404: { description: "Not found" } } },
    },
    "/api/projects/{id}/rotate-key": {
      post: { tags: ["Projects"], summary: "Rotate project API key", parameters: [pathUuid], responses: { 200: { description: "New API key generated" } } },
    },

    // Issues
    "/api/issues": {
      get: {
        tags: ["Issues"], summary: "List issues with filters",
        parameters: [queryUuid("projectId"), queryStr("status"), queryStr("search"), queryStr("environment"), queryStr("level"), queryStr("limit"), queryStr("offset")],
        responses: { 200: { description: "Paginated issue list", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Issue" } }, total: { type: "integer" }, limit: { type: "integer" }, offset: { type: "integer" } } } } } } },
      },
    },
    "/api/issues/{id}": {
      get: { tags: ["Issues"], summary: "Get issue detail with recent events", parameters: [pathUuid], responses: { 200: { description: "Issue detail" }, 404: { description: "Not found" } } },
      patch: { tags: ["Issues"], summary: "Update issue status or assignment", parameters: [pathUuid], requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/IssueUpdate" } } } }, responses: { 200: { description: "Issue updated" }, 400: { description: "Validation error" }, 404: { description: "Not found" } } },
      delete: { tags: ["Issues"], summary: "Delete an issue and its events", parameters: [pathUuid], responses: { 200: { description: "Issue deleted" } } },
    },
    "/api/issues/merge": {
      post: { tags: ["Issues"], summary: "Merge source issues into a target issue", requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/IssueMerge" } } } }, responses: { 200: { description: "Issues merged" } } },
    },

    // Events
    "/api/events": {
      get: {
        tags: ["Events"], summary: "List events",
        parameters: [queryUuid("issueId"), queryUuid("projectId"), queryStr("limit"), queryStr("offset")],
        responses: { 200: { description: "Paginated event list", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Event" } }, total: { type: "integer" } } } } } } },
      },
    },
    "/api/events/{id}": {
      get: { tags: ["Events"], summary: "Get single event", parameters: [pathUuid], responses: { 200: { description: "Event detail" }, 404: { description: "Not found" } } },
    },

    // Monitors
    "/api/monitors": {
      get: {
        tags: ["Monitors"], summary: "List monitors with uptime",
        parameters: [queryStr("project_id"), queryStr("group"), param("hours", "query", { type: "integer" })],
        responses: { 200: { description: "Monitor list with uptime24h" } },
      },
      post: { tags: ["Monitors"], summary: "Create a monitor", requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/MonitorCreate" } } } }, responses: { 200: { description: "Monitor created" }, 400: { description: "Validation error" } } },
    },
    "/api/monitors/groups": {
      get: { tags: ["Monitors"], summary: "List monitor groups", parameters: [queryStr("project_id")], responses: { 200: { description: "Group list" } } },
    },
    "/api/monitors/{id}": {
      get: { tags: ["Monitors"], summary: "Get monitor detail", parameters: [pathId], responses: { 200: { description: "Monitor detail" }, 404: { description: "Not found" } } },
      put: { tags: ["Monitors"], summary: "Update monitor", parameters: [pathId], requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/MonitorUpdate" } } } }, responses: { 200: { description: "Monitor updated" } } },
      delete: { tags: ["Monitors"], summary: "Delete monitor", parameters: [pathId], responses: { 200: { description: "Monitor deleted" } } },
    },
    "/api/monitors/{id}/checks": {
      get: { tags: ["Monitors"], summary: "Get monitor check history", parameters: [pathId, param("limit", "query", { type: "integer" }), param("offset", "query", { type: "integer" }), param("from", "query", { type: "string", format: "date-time" }), param("to", "query", { type: "string", format: "date-time" })], responses: { 200: { description: "Check history" } } },
    },

    // Alerts
    "/api/alerts": {
      get: {
        tags: ["Alerts"], summary: "List alert rules",
        parameters: [queryStr("projectId"), queryStr("search"), queryStr("limit"), queryStr("offset")],
        responses: { 200: { description: "Alert rules list", content: { "application/json": { schema: { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/Alert" } }, total: { type: "integer" } } } } } } },
      },
      post: { tags: ["Alerts"], summary: "Create alert rule", requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/AlertCreate" } } } }, responses: { 200: { description: "Alert created" } } },
    },
    "/api/alerts/history": {
      get: { tags: ["Alerts"], summary: "List alert trigger history", parameters: [queryStr("alertId"), queryStr("limit"), queryStr("offset")], responses: { 200: { description: "Alert history", content: { "application/json": { schema: { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/AlertHistory" } } } } } } } } },
    },
    "/api/alerts/channels": {
      get: { tags: ["Alerts"], summary: "List available notification channels", responses: { 200: { description: "Channel list" } } },
    },
    "/api/alerts/test-all": {
      post: { tags: ["Alerts"], summary: "Test all active alerts", responses: { 200: { description: "Test results" } } },
    },
    "/api/alerts/{id}": {
      get: { tags: ["Alerts"], summary: "Get alert detail with history", parameters: [pathId], responses: { 200: { description: "Alert detail" }, 404: { description: "Not found" } } },
      put: { tags: ["Alerts"], summary: "Update alert rule", parameters: [pathId], requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/AlertUpdate" } } } }, responses: { 200: { description: "Alert updated" } } },
      delete: { tags: ["Alerts"], summary: "Delete alert rule", parameters: [pathId], responses: { 200: { description: "Alert deleted" } } },
    },
    "/api/alerts/{id}/test": {
      post: { tags: ["Alerts"], summary: "Test a single alert", parameters: [pathId], responses: { 200: { description: "Test result" } } },
    },

    // Traces
    "/api/traces": {
      get: {
        tags: ["Traces"], summary: "List traces with filters",
        parameters: [queryStr("projectId"), queryStr("traceId"), queryStr("workflowName"), queryStr("agentName"), queryStr("status"), queryStr("from"), queryStr("to"), queryStr("limit"), queryStr("offset")],
        responses: { 200: { description: "Trace list", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Trace" } }, total: { type: "integer" } } } } } } },
      },
    },
    "/api/traces/stats": {
      get: { tags: ["Traces"], summary: "Aggregated trace stats (token usage + latency)", parameters: [queryUuid("projectId"), queryStr("from"), queryStr("to"), queryStr("groupBy")], responses: { 200: { description: "Token usage and latency stats" } } },
    },
    "/api/traces/workflows": {
      get: { tags: ["Traces"], summary: "List workflow runs", parameters: [queryStr("projectId"), queryStr("workflowName"), queryStr("status"), queryStr("limit"), queryStr("offset")], responses: { 200: { description: "Workflow run list" } } },
    },
    "/api/traces/workflows/{id}": {
      get: { tags: ["Traces"], summary: "Get workflow run detail", parameters: [pathId], responses: { 200: { description: "Workflow run detail" }, 404: { description: "Not found" } } },
    },
    "/api/traces/{id}": {
      get: { tags: ["Traces"], summary: "Get trace detail with span tree", parameters: [pathId], responses: { 200: { description: "Trace detail" }, 404: { description: "Not found" } } },
    },

    // Logs
    "/api/logs": {
      get: {
        tags: ["Logs"], summary: "Search logs with filters (text, regex, or fuzzy)",
        parameters: [queryStr("container"), queryStr("level"), queryStr("search"), queryStr("regex"), queryStr("fuzzy"), queryStr("from"), queryStr("to"), param("limit", "query", { type: "number" }), param("offset", "query", { type: "number" })],
        responses: { 200: { description: "Log search results" } },
      },
      delete: { tags: ["Logs"], summary: "Clear logs before a timestamp", parameters: [queryStr("before")], responses: { 200: { description: "Logs cleared" } } },
    },
    "/api/logs/stats": {
      get: { tags: ["Logs"], summary: "Log statistics (24h volume, by level, by container, by hour)", responses: { 200: { description: "Log stats" } } },
    },
    "/api/logs/volume": {
      get: { tags: ["Logs"], summary: "Log volume over time intervals", parameters: [queryStr("interval"), queryStr("containerId"), queryStr("from"), queryStr("to")], responses: { 200: { description: "Volume data" } } },
    },
    "/api/logs/containers": {
      get: { tags: ["Logs"], summary: "List log containers", responses: { 200: { description: "Container list" } } },
    },

    // Dashboard
    "/api/dashboard": {
      get: { tags: ["Dashboard"], summary: "Get aggregated dashboard data", parameters: [queryStr("projectId")], responses: { 200: { description: "Dashboard summary", content: { "application/json": { schema: { $ref: "#/components/schemas/Dashboard" } } } } } },
    },

    // Releases
    "/api/releases": {
      get: {
        tags: ["Releases"], summary: "List releases",
        parameters: [queryUuid("projectId"), queryStr("environment"), queryStr("limit"), queryStr("offset")],
        responses: { 200: { description: "Release list", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Release" } }, total: { type: "integer" } } } } } } },
      },
      post: { tags: ["Releases"], summary: "Create a release", requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/ReleaseCreate" } } } }, responses: { 201: { description: "Release created" } } },
    },
    "/api/releases/{id}": {
      get: { tags: ["Releases"], summary: "Get release detail", parameters: [pathUuid], responses: { 200: { description: "Release detail" }, 404: { description: "Not found" } } },
      put: { tags: ["Releases"], summary: "Update release", parameters: [pathUuid], responses: { 200: { description: "Release updated" } } },
      delete: { tags: ["Releases"], summary: "Delete release", parameters: [pathUuid], responses: { 200: { description: "Release deleted" } } },
    },
    "/api/releases/{id}/health": {
      get: { tags: ["Releases"], summary: "Get release health metrics", parameters: [pathUuid], responses: { 200: { description: "Release health", content: { "application/json": { schema: { $ref: "#/components/schemas/ReleaseHealth" } } } } } },
    },

    // Team
    "/api/team": {
      get: {
        tags: ["Team"], summary: "List team members",
        parameters: [queryUuid("projectId"), queryStr("limit"), queryStr("offset")],
        responses: { 200: { description: "Team member list", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/TeamMember" } }, total: { type: "integer" } } } } } } },
      },
      post: { tags: ["Team"], summary: "Add team member", requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/TeamMemberCreate" } } } }, responses: { 201: { description: "Team member created" }, 409: { description: "Duplicate email" } } },
    },
    "/api/team/{id}": {
      put: { tags: ["Team"], summary: "Update team member", parameters: [pathUuid], requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/TeamMemberUpdate" } } } }, responses: { 200: { description: "Team member updated" }, 404: { description: "Not found" } } },
      delete: { tags: ["Team"], summary: "Remove team member", parameters: [pathUuid], responses: { 200: { description: "Team member removed" }, 404: { description: "Not found" } } },
    },

    // Comments
    "/api/issues/{issueId}/comments": {
      get: {
        tags: ["Comments"], summary: "List comments for an issue",
        parameters: [param("issueId", "path", { type: "string", format: "uuid" }, true), queryStr("limit"), queryStr("offset")],
        responses: { 200: { description: "Comment list", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Comment" } }, total: { type: "integer" } } } } } } },
      },
      post: { tags: ["Comments"], summary: "Add comment to issue", parameters: [param("issueId", "path", { type: "string", format: "uuid" }, true)], requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/CommentCreate" } } } }, responses: { 201: { description: "Comment created" }, 404: { description: "Issue not found" } } },
    },
    "/api/comments/{id}": {
      delete: { tags: ["Comments"], summary: "Delete a comment", parameters: [pathUuid], responses: { 200: { description: "Comment deleted" }, 404: { description: "Not found" } } },
    },

    // Maintenance
    "/api/maintenance": {
      get: {
        tags: ["Maintenance"], summary: "List maintenance windows",
        parameters: [queryStr("projectId"), param("status", "query", { type: "string", enum: ["active", "upcoming", "past"] }), queryStr("limit"), queryStr("offset")],
        responses: { 200: { description: "Maintenance window list", content: { "application/json": { schema: { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/MaintenanceWindow" } }, total: { type: "integer" } } } } } } },
      },
      post: { tags: ["Maintenance"], summary: "Create maintenance window", requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/MaintenanceWindowCreate" } } } }, responses: { 200: { description: "Maintenance window created" }, 400: { description: "Validation error" } } },
    },
    "/api/maintenance/active/now": {
      get: { tags: ["Maintenance"], summary: "Get currently active maintenance windows", parameters: [queryStr("projectId")], responses: { 200: { description: "Active windows" } } },
    },
    "/api/maintenance/{id}": {
      get: { tags: ["Maintenance"], summary: "Get maintenance window", parameters: [pathId], responses: { 200: { description: "Maintenance window" }, 404: { description: "Not found" } } },
      put: { tags: ["Maintenance"], summary: "Update maintenance window", parameters: [pathId], requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/MaintenanceWindowUpdate" } } } }, responses: { 200: { description: "Maintenance window updated" }, 404: { description: "Not found" } } },
      delete: { tags: ["Maintenance"], summary: "Delete maintenance window", parameters: [pathId], responses: { 200: { description: "Maintenance window deleted" }, 404: { description: "Not found" } } },
    },

    // Incidents
    "/api/incidents": {
      get: {
        tags: ["Incidents"], summary: "List incidents",
        parameters: [queryStr("projectId"), param("status", "query", { type: "string", enum: ["investigating", "identified", "monitoring", "resolved"] }), queryStr("limit"), queryStr("offset")],
        responses: { 200: { description: "Incident list", content: { "application/json": { schema: { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/Incident" } }, total: { type: "integer" } } } } } } },
      },
      post: { tags: ["Incidents"], summary: "Create incident", requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/IncidentCreate" } } } }, responses: { 200: { description: "Incident created" } } },
    },
    "/api/incidents/active": {
      get: { tags: ["Incidents"], summary: "Get active (non-resolved) incidents", parameters: [queryStr("projectId")], responses: { 200: { description: "Active incidents" } } },
    },
    "/api/incidents/{id}": {
      get: { tags: ["Incidents"], summary: "Get incident", parameters: [pathId], responses: { 200: { description: "Incident" }, 404: { description: "Not found" } } },
      put: { tags: ["Incidents"], summary: "Update incident (status lifecycle)", parameters: [pathId], requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/IncidentUpdate" } } } }, responses: { 200: { description: "Incident updated" }, 400: { description: "Invalid status transition" } } },
      delete: { tags: ["Incidents"], summary: "Delete incident", parameters: [pathId], responses: { 200: { description: "Incident deleted" }, 404: { description: "Not found" } } },
    },

    // Notifications
    "/api/notifications": {
      get: { tags: ["Notifications"], summary: "List notification configs", parameters: [queryStr("projectId")], responses: { 200: { description: "Notification configs" } } },
    },
    "/api/notifications/{channel}": {
      get: { tags: ["Notifications"], summary: "Get notification channel config", parameters: [param("channel", "path", { type: "string" }, true), queryStr("projectId")], responses: { 200: { description: "Channel config" } } },
      put: { tags: ["Notifications"], summary: "Upsert notification channel config", parameters: [param("channel", "path", { type: "string" }, true)], responses: { 200: { description: "Config updated" }, 201: { description: "Config created" } } },
      delete: { tags: ["Notifications"], summary: "Delete notification channel config", parameters: [param("channel", "path", { type: "string" }, true), queryStr("projectId")], responses: { 200: { description: "Config deleted" } } },
    },
    "/api/notifications/{channel}/test": {
      post: { tags: ["Notifications"], summary: "Test a notification channel", parameters: [param("channel", "path", { type: "string" }, true), queryStr("projectId")], responses: { 200: { description: "Test result" } } },
    },

    // Search
    "/api/search": {
      get: {
        tags: ["Search"], summary: "Cross-project search across issues, events, and traces",
        parameters: [param("q", "query", { type: "string", minLength: 1 }, true), queryUuid("projectId"), queryStr("limit")],
        responses: { 200: { description: "Search results grouped by type" } },
      },
    },
  };
}

function buildSpec() {
  return {
    openapi: "3.0.3",
    info: {
      title: "HiAi Observe API",
      description:
        "Unified, self-hosted observability platform for AI Agents and TypeScript backends. " +
        "Replaces Bugsink + Uptime Kuma + Beszel + Dozzle + LLM tracing in one lightweight container.",
      version: "0.1.0",
      license: { name: "MIT", url: "https://opensource.org/licenses/MIT" },
      contact: { name: "HiAi Observe", url: "https://github.com/hiai/observe" },
    },
    servers: [{ url: "http://localhost:8001", description: "Local development" }],
    security: [{ ApiKeyAuth: [] }],
    tags: [
      { name: "Health", description: "Public health and status endpoints" },
      { name: "Projects", description: "Project management" },
      { name: "Issues", description: "Error issue tracking" },
      { name: "Events", description: "Individual error events" },
      { name: "Monitors", description: "Uptime monitoring" },
      { name: "Alerts", description: "Alert rules and history" },
      { name: "Traces", description: "Distributed traces and workflows" },
      { name: "Logs", description: "Container log search" },
      { name: "Dashboard", description: "Aggregated dashboard data" },
      { name: "Releases", description: "Release tracking" },
      { name: "Team", description: "Team member management" },
      { name: "Comments", description: "Issue comments" },
      { name: "Maintenance", description: "Maintenance windows" },
      { name: "Incidents", description: "Incident lifecycle" },
      { name: "Notifications", description: "Notification channel config" },
      { name: "Search", description: "Cross-project search" },
      { name: "Infrastructure", description: "Host and container metrics" },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey" as const,
          in: "header" as const,
          name: "Authorization",
          description: "Bearer token: Authorization: Bearer <api_key>",
        },
      },
      schemas: buildSchemas(),
    },
    paths: buildPaths(),
  };
}

/**
 * Serve the OpenAPI spec as JSON at /api/openapi.json (public, no auth).
 */
export const openapiRoutes = new Elysia({ prefix: "/api" }).get(
  "/openapi.json",
  () => buildSpec(),
);
