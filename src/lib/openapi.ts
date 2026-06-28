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
        type: {
          type: "string",
          enum: ["error_rate", "uptime_down", "resource_threshold", "trace_error", "token_usage"],
        },
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
        type: {
          type: "string",
          enum: [
            "telegram",
            "discord",
            "email",
            "slack",
            "webhook",
            "pagerduty",
            "teams",
            "ntfy",
            "gotify",
            "pushover",
          ],
        },
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
          properties: {
            prompt: { type: "integer" },
            completion: { type: "integer" },
            total: { type: "integer" },
          },
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
      properties: {
        authorName: { type: "string", minLength: 1 },
        body: { type: "string", minLength: 1 },
      },
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
  const param = (
    name: string,
    where: string,
    schema: Record<string, unknown>,
    required = false,
  ) => ({ name, in: where, required, schema });
  const queryStr = (name: string) => param(name, "query", { type: "string" });
  const queryUuid = (name: string) => param(name, "query", { type: "string", format: "uuid" });
  const pathId = param("id", "path", { type: "string" }, true);
  const pathUuid = param("id", "path", { type: "string", format: "uuid" }, true);

  return {
    // Health
    "/api/health": {
      get: {
        tags: ["Health"],
        summary: "Health check (canonical HiAi ecosystem endpoint)",
        description:
          "Canonical HiAi ecosystem health endpoint. Returns service status, " +
          "version, uptime, memory, disk, dependencies (postgres/redis/disk), " +
          "worker health, and last error. Returns 503 when both postgres and " +
          "redis are unavailable.",
        security: [],
        responses: {
          200: {
            description: "Service healthy or degraded (at least one dependency is up)",
          },
          503: { description: "Service error — all critical dependencies are down" },
        },
      },
    },
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Health check (legacy alias)",
        description:
          "Legacy alias for /api/health, kept for backwards compatibility with " +
          "existing monitors, Sentry DSN healthchecks, and Docker healthchecks. " +
          "New integrations should use /api/health.",
        security: [],
        responses: { 200: { description: "Service healthy" } },
      },
    },
    "/metrics": {
      get: {
        tags: ["Health"],
        summary: "Prometheus metrics",
        security: [],
        responses: { 200: { description: "Prometheus format metrics" } },
      },
    },

    // Projects
    "/api/projects": {
      get: {
        tags: ["Projects"],
        summary: "List all projects",
        responses: { 200: { description: "List of projects" } },
      },
      post: {
        tags: ["Projects"],
        summary: "Create a project",
        requestBody: {
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ProjectCreate" } },
          },
        },
        responses: { 201: { description: "Project created" } },
      },
    },
    "/api/projects/{id}": {
      delete: {
        tags: ["Projects"],
        summary: "Delete a project and all its data",
        parameters: [pathUuid],
        responses: { 200: { description: "Project deleted" }, 404: { description: "Not found" } },
      },
    },
    "/api/projects/{id}/rotate-key": {
      post: {
        tags: ["Projects"],
        summary: "Rotate project API key",
        parameters: [pathUuid],
        responses: { 200: { description: "New API key generated" } },
      },
    },

    // Issues
    "/api/issues": {
      get: {
        tags: ["Issues"],
        summary: "List issues with filters",
        parameters: [
          queryUuid("projectId"),
          queryStr("status"),
          queryStr("search"),
          queryStr("environment"),
          queryStr("level"),
          queryStr("limit"),
          queryStr("offset"),
        ],
        responses: {
          200: {
            description: "Paginated issue list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Issue" } },
                    total: { type: "integer" },
                    limit: { type: "integer" },
                    offset: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/issues/{id}": {
      get: {
        tags: ["Issues"],
        summary: "Get issue detail with recent events",
        parameters: [pathUuid],
        responses: { 200: { description: "Issue detail" }, 404: { description: "Not found" } },
      },
      patch: {
        tags: ["Issues"],
        summary: "Update issue status or assignment",
        parameters: [pathUuid],
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/IssueUpdate" } } },
        },
        responses: {
          200: { description: "Issue updated" },
          400: { description: "Validation error" },
          404: { description: "Not found" },
        },
      },
      delete: {
        tags: ["Issues"],
        summary: "Delete an issue and its events",
        parameters: [pathUuid],
        responses: { 200: { description: "Issue deleted" } },
      },
    },
    "/api/issues/merge": {
      post: {
        tags: ["Issues"],
        summary: "Merge source issues into a target issue",
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/IssueMerge" } } },
        },
        responses: { 200: { description: "Issues merged" } },
      },
    },

    // Events
    "/api/events": {
      get: {
        tags: ["Events"],
        summary: "List events",
        parameters: [
          queryUuid("issueId"),
          queryUuid("projectId"),
          queryStr("limit"),
          queryStr("offset"),
        ],
        responses: {
          200: {
            description: "Paginated event list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Event" } },
                    total: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/events/{id}": {
      get: {
        tags: ["Events"],
        summary: "Get single event",
        parameters: [pathUuid],
        responses: { 200: { description: "Event detail" }, 404: { description: "Not found" } },
      },
    },

    // Monitors
    "/api/monitors": {
      get: {
        tags: ["Monitors"],
        summary: "List monitors with uptime",
        parameters: [
          queryStr("project_id"),
          queryStr("group"),
          param("hours", "query", { type: "integer" }),
        ],
        responses: { 200: { description: "Monitor list with uptime24h" } },
      },
      post: {
        tags: ["Monitors"],
        summary: "Create a monitor",
        requestBody: {
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/MonitorCreate" } },
          },
        },
        responses: {
          200: { description: "Monitor created" },
          400: { description: "Validation error" },
        },
      },
    },
    "/api/monitors/groups": {
      get: {
        tags: ["Monitors"],
        summary: "List monitor groups",
        parameters: [queryStr("project_id")],
        responses: { 200: { description: "Group list" } },
      },
    },
    "/api/monitors/{id}": {
      get: {
        tags: ["Monitors"],
        summary: "Get monitor detail",
        parameters: [pathId],
        responses: { 200: { description: "Monitor detail" }, 404: { description: "Not found" } },
      },
      put: {
        tags: ["Monitors"],
        summary: "Update monitor",
        parameters: [pathId],
        requestBody: {
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/MonitorUpdate" } },
          },
        },
        responses: { 200: { description: "Monitor updated" } },
      },
      delete: {
        tags: ["Monitors"],
        summary: "Delete monitor",
        parameters: [pathId],
        responses: { 200: { description: "Monitor deleted" } },
      },
    },
    "/api/monitors/{id}/checks": {
      get: {
        tags: ["Monitors"],
        summary: "Get monitor check history",
        parameters: [
          pathId,
          param("limit", "query", { type: "integer" }),
          param("offset", "query", { type: "integer" }),
          param("from", "query", { type: "string", format: "date-time" }),
          param("to", "query", { type: "string", format: "date-time" }),
        ],
        responses: { 200: { description: "Check history" } },
      },
    },

    // Alerts
    "/api/alerts": {
      get: {
        tags: ["Alerts"],
        summary: "List alert rules",
        parameters: [
          queryStr("projectId"),
          queryStr("search"),
          queryStr("limit"),
          queryStr("offset"),
        ],
        responses: {
          200: {
            description: "Alert rules list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: { type: "array", items: { $ref: "#/components/schemas/Alert" } },
                    total: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Alerts"],
        summary: "Create alert rule",
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/AlertCreate" } } },
        },
        responses: { 200: { description: "Alert created" } },
      },
    },
    "/api/alerts/history": {
      get: {
        tags: ["Alerts"],
        summary: "List alert trigger history",
        parameters: [queryStr("alertId"), queryStr("limit"), queryStr("offset")],
        responses: {
          200: {
            description: "Alert history",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: { type: "array", items: { $ref: "#/components/schemas/AlertHistory" } },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/alerts/channels": {
      get: {
        tags: ["Alerts"],
        summary: "List available notification channels",
        responses: { 200: { description: "Channel list" } },
      },
    },
    "/api/alerts/test-all": {
      post: {
        tags: ["Alerts"],
        summary: "Test all active alerts",
        responses: { 200: { description: "Test results" } },
      },
    },
    "/api/alerts/{id}": {
      get: {
        tags: ["Alerts"],
        summary: "Get alert detail with history",
        parameters: [pathId],
        responses: { 200: { description: "Alert detail" }, 404: { description: "Not found" } },
      },
      put: {
        tags: ["Alerts"],
        summary: "Update alert rule",
        parameters: [pathId],
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/AlertUpdate" } } },
        },
        responses: { 200: { description: "Alert updated" } },
      },
      delete: {
        tags: ["Alerts"],
        summary: "Delete alert rule",
        parameters: [pathId],
        responses: { 200: { description: "Alert deleted" } },
      },
    },
    "/api/alerts/{id}/test": {
      post: {
        tags: ["Alerts"],
        summary: "Test a single alert",
        parameters: [pathId],
        responses: { 200: { description: "Test result" } },
      },
    },

    // Traces
    "/api/traces": {
      get: {
        tags: ["Traces"],
        summary: "List traces with filters",
        parameters: [
          queryStr("projectId"),
          queryStr("traceId"),
          queryStr("workflowName"),
          queryStr("agentName"),
          queryStr("status"),
          queryStr("from"),
          queryStr("to"),
          queryStr("limit"),
          queryStr("offset"),
        ],
        responses: {
          200: {
            description: "Trace list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Trace" } },
                    total: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/traces/stats": {
      get: {
        tags: ["Traces"],
        summary: "Aggregated trace stats (token usage + latency)",
        parameters: [queryUuid("projectId"), queryStr("from"), queryStr("to"), queryStr("groupBy")],
        responses: { 200: { description: "Token usage and latency stats" } },
      },
    },
    "/api/traces/workflows": {
      get: {
        tags: ["Traces"],
        summary: "List workflow runs",
        parameters: [
          queryStr("projectId"),
          queryStr("workflowName"),
          queryStr("status"),
          queryStr("limit"),
          queryStr("offset"),
        ],
        responses: { 200: { description: "Workflow run list" } },
      },
    },
    "/api/traces/workflows/{id}": {
      get: {
        tags: ["Traces"],
        summary: "Get workflow run detail",
        parameters: [pathId],
        responses: {
          200: { description: "Workflow run detail" },
          404: { description: "Not found" },
        },
      },
    },
    "/api/traces/{id}": {
      get: {
        tags: ["Traces"],
        summary: "Get trace detail with span tree",
        parameters: [pathId],
        responses: { 200: { description: "Trace detail" }, 404: { description: "Not found" } },
      },
    },

    // Logs
    "/api/logs": {
      get: {
        tags: ["Logs"],
        summary: "Search logs with filters (text, regex, or fuzzy)",
        parameters: [
          queryStr("container"),
          queryStr("level"),
          queryStr("search"),
          queryStr("regex"),
          queryStr("fuzzy"),
          queryStr("from"),
          queryStr("to"),
          param("limit", "query", { type: "number" }),
          param("offset", "query", { type: "number" }),
        ],
        responses: { 200: { description: "Log search results" } },
      },
      delete: {
        tags: ["Logs"],
        summary: "Clear logs before a timestamp",
        parameters: [queryStr("before")],
        responses: { 200: { description: "Logs cleared" } },
      },
    },
    "/api/logs/stats": {
      get: {
        tags: ["Logs"],
        summary: "Log statistics (24h volume, by level, by container, by hour)",
        responses: { 200: { description: "Log stats" } },
      },
    },
    "/api/logs/volume": {
      get: {
        tags: ["Logs"],
        summary: "Log volume over time intervals",
        parameters: [
          queryStr("interval"),
          queryStr("containerId"),
          queryStr("from"),
          queryStr("to"),
        ],
        responses: { 200: { description: "Volume data" } },
      },
    },
    "/api/logs/containers": {
      get: {
        tags: ["Logs"],
        summary: "List log containers",
        responses: { 200: { description: "Container list" } },
      },
    },

    // Dashboard
    "/api/dashboard": {
      get: {
        tags: ["Dashboard"],
        summary: "Get aggregated dashboard data",
        parameters: [queryStr("projectId"), queryStr("tenantId")],
        responses: {
          200: {
            description: "Dashboard summary",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Dashboard" } } },
          },
        },
      },
    },

    // Embed — iframe-friendly endpoints for hiai-dashboard integration (OBS2.4)
    "/embed": {
      get: {
        tags: ["Embed"],
        summary: "Public embed landing page (iframe-friendly)",
        parameters: [queryStr("tenantId"), queryStr("slug")],
        responses: {
          200: { description: "HTML landing page with frame-friendly CSP" },
        },
      },
    },
    "/embed/dashboard": {
      get: {
        tags: ["Embed"],
        summary: "Dashboard overview snapshot for hiai-dashboard tiles",
        description:
          "Returns aggregated overview data: projectsCount, activeIssues, activeAlerts, healthStatus, recentEvents, monitors. Accepts ?tenantId= alias of ?projectId=.",
        parameters: [queryStr("tenantId"), queryStr("projectId"), queryStr("limit")],
        responses: {
          200: { description: "Dashboard overview JSON" },
          401: { description: "Missing or invalid API key" },
        },
        security: [{ ApiKeyAuth: [] }],
      },
    },
    "/embed/status/{slug}": {
      get: {
        tags: ["Embed"],
        summary: "Public iframe-friendly status page (JSON)",
        parameters: [param("slug", "path", { type: "string" }, true)],
        responses: {
          200: { description: "Status JSON with frame-friendly CSP" },
          404: { description: "Status page not found" },
        },
      },
    },

    // Releases
    "/api/releases": {
      get: {
        tags: ["Releases"],
        summary: "List releases",
        parameters: [
          queryUuid("projectId"),
          queryStr("environment"),
          queryStr("limit"),
          queryStr("offset"),
        ],
        responses: {
          200: {
            description: "Release list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Release" } },
                    total: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Releases"],
        summary: "Create a release",
        requestBody: {
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ReleaseCreate" } },
          },
        },
        responses: { 201: { description: "Release created" } },
      },
    },
    "/api/releases/{id}": {
      get: {
        tags: ["Releases"],
        summary: "Get release detail",
        parameters: [pathUuid],
        responses: { 200: { description: "Release detail" }, 404: { description: "Not found" } },
      },
      put: {
        tags: ["Releases"],
        summary: "Update release",
        parameters: [pathUuid],
        responses: { 200: { description: "Release updated" } },
      },
      delete: {
        tags: ["Releases"],
        summary: "Delete release",
        parameters: [pathUuid],
        responses: { 200: { description: "Release deleted" } },
      },
    },
    "/api/releases/{id}/health": {
      get: {
        tags: ["Releases"],
        summary: "Get release health metrics",
        parameters: [pathUuid],
        responses: {
          200: {
            description: "Release health",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ReleaseHealth" } },
            },
          },
        },
      },
    },

    // Team
    "/api/team": {
      get: {
        tags: ["Team"],
        summary: "List team members",
        parameters: [queryUuid("projectId"), queryStr("limit"), queryStr("offset")],
        responses: {
          200: {
            description: "Team member list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/TeamMember" } },
                    total: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Team"],
        summary: "Add team member",
        requestBody: {
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/TeamMemberCreate" } },
          },
        },
        responses: {
          201: { description: "Team member created" },
          409: { description: "Duplicate email" },
        },
      },
    },
    "/api/team/{id}": {
      put: {
        tags: ["Team"],
        summary: "Update team member",
        parameters: [pathUuid],
        requestBody: {
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/TeamMemberUpdate" } },
          },
        },
        responses: {
          200: { description: "Team member updated" },
          404: { description: "Not found" },
        },
      },
      delete: {
        tags: ["Team"],
        summary: "Remove team member",
        parameters: [pathUuid],
        responses: {
          200: { description: "Team member removed" },
          404: { description: "Not found" },
        },
      },
    },

    // Comments
    "/api/issues/{issueId}/comments": {
      get: {
        tags: ["Comments"],
        summary: "List comments for an issue",
        parameters: [
          param("issueId", "path", { type: "string", format: "uuid" }, true),
          queryStr("limit"),
          queryStr("offset"),
        ],
        responses: {
          200: {
            description: "Comment list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Comment" } },
                    total: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Comments"],
        summary: "Add comment to issue",
        parameters: [param("issueId", "path", { type: "string", format: "uuid" }, true)],
        requestBody: {
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CommentCreate" } },
          },
        },
        responses: {
          201: { description: "Comment created" },
          404: { description: "Issue not found" },
        },
      },
    },
    "/api/comments": {
      get: {
        tags: ["Comments"],
        summary: "List comments for an issue (alternative flat route)",
        description:
          "Flat alternative to GET /api/issues/{issueId}/comments. Returns the same " +
          "paginated comment list filtered by issueId query parameter.",
        parameters: [queryUuid("issueId"), queryStr("limit"), queryStr("offset")],
        responses: {
          200: {
            description: "Comment list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Comment" } },
                    total: { type: "integer" },
                    limit: { type: "integer" },
                    offset: { type: "integer" },
                  },
                },
              },
            },
          },
          404: { description: "Issue not found" },
        },
      },
    },
    "/api/comments/{id}": {
      delete: {
        tags: ["Comments"],
        summary: "Delete a comment",
        parameters: [pathUuid],
        responses: { 200: { description: "Comment deleted" }, 404: { description: "Not found" } },
      },
    },

    // Maintenance
    "/api/maintenance": {
      get: {
        tags: ["Maintenance"],
        summary: "List maintenance windows",
        parameters: [
          queryStr("projectId"),
          param("status", "query", { type: "string", enum: ["active", "upcoming", "past"] }),
          queryStr("limit"),
          queryStr("offset"),
        ],
        responses: {
          200: {
            description: "Maintenance window list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: {
                      type: "array",
                      items: { $ref: "#/components/schemas/MaintenanceWindow" },
                    },
                    total: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Maintenance"],
        summary: "Create maintenance window",
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MaintenanceWindowCreate" },
            },
          },
        },
        responses: {
          200: { description: "Maintenance window created" },
          400: { description: "Validation error" },
        },
      },
    },
    "/api/maintenance/active/now": {
      get: {
        tags: ["Maintenance"],
        summary: "Get currently active maintenance windows",
        parameters: [queryStr("projectId")],
        responses: { 200: { description: "Active windows" } },
      },
    },
    "/api/maintenance/{id}": {
      get: {
        tags: ["Maintenance"],
        summary: "Get maintenance window",
        parameters: [pathId],
        responses: {
          200: { description: "Maintenance window" },
          404: { description: "Not found" },
        },
      },
      put: {
        tags: ["Maintenance"],
        summary: "Update maintenance window",
        parameters: [pathId],
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MaintenanceWindowUpdate" },
            },
          },
        },
        responses: {
          200: { description: "Maintenance window updated" },
          404: { description: "Not found" },
        },
      },
      delete: {
        tags: ["Maintenance"],
        summary: "Delete maintenance window",
        parameters: [pathId],
        responses: {
          200: { description: "Maintenance window deleted" },
          404: { description: "Not found" },
        },
      },
    },

    // Incidents
    "/api/incidents": {
      get: {
        tags: ["Incidents"],
        summary: "List incidents",
        parameters: [
          queryStr("projectId"),
          param("status", "query", {
            type: "string",
            enum: ["investigating", "identified", "monitoring", "resolved"],
          }),
          queryStr("limit"),
          queryStr("offset"),
        ],
        responses: {
          200: {
            description: "Incident list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: { type: "array", items: { $ref: "#/components/schemas/Incident" } },
                    total: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Incidents"],
        summary: "Create incident",
        requestBody: {
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/IncidentCreate" } },
          },
        },
        responses: { 200: { description: "Incident created" } },
      },
    },
    "/api/incidents/active": {
      get: {
        tags: ["Incidents"],
        summary: "Get active (non-resolved) incidents",
        parameters: [queryStr("projectId")],
        responses: { 200: { description: "Active incidents" } },
      },
    },
    "/api/incidents/{id}": {
      get: {
        tags: ["Incidents"],
        summary: "Get incident",
        parameters: [pathId],
        responses: { 200: { description: "Incident" }, 404: { description: "Not found" } },
      },
      put: {
        tags: ["Incidents"],
        summary: "Update incident (status lifecycle)",
        parameters: [pathId],
        requestBody: {
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/IncidentUpdate" } },
          },
        },
        responses: {
          200: { description: "Incident updated" },
          400: { description: "Invalid status transition" },
        },
      },
      delete: {
        tags: ["Incidents"],
        summary: "Delete incident",
        parameters: [pathId],
        responses: { 200: { description: "Incident deleted" }, 404: { description: "Not found" } },
      },
    },

    // Notifications
    "/api/notifications": {
      get: {
        tags: ["Notifications"],
        summary: "List notification configs",
        parameters: [queryStr("projectId")],
        responses: { 200: { description: "Notification configs" } },
      },
    },
    "/api/notifications/{channel}": {
      get: {
        tags: ["Notifications"],
        summary: "Get notification channel config",
        parameters: [param("channel", "path", { type: "string" }, true), queryStr("projectId")],
        responses: { 200: { description: "Channel config" } },
      },
      put: {
        tags: ["Notifications"],
        summary: "Upsert notification channel config",
        parameters: [param("channel", "path", { type: "string" }, true)],
        responses: {
          200: { description: "Config updated" },
          201: { description: "Config created" },
        },
      },
      delete: {
        tags: ["Notifications"],
        summary: "Delete notification channel config",
        parameters: [param("channel", "path", { type: "string" }, true), queryStr("projectId")],
        responses: { 200: { description: "Config deleted" } },
      },
    },
    "/api/notifications/{channel}/test": {
      post: {
        tags: ["Notifications"],
        summary: "Test a notification channel",
        parameters: [param("channel", "path", { type: "string" }, true), queryStr("projectId")],
        responses: { 200: { description: "Test result" } },
      },
    },

    // Search
    "/api/search": {
      get: {
        tags: ["Search"],
        summary: "Cross-project search across issues, events, and traces",
        parameters: [
          param("q", "query", { type: "string", minLength: 1 }, true),
          queryUuid("projectId"),
          queryStr("limit"),
        ],
        responses: { 200: { description: "Search results grouped by type" } },
      },
    },

    // ── [3.1] Infrastructure ───────────────────────────────────────────────
    // Host + container telemetry (multi-host via ?hostId=). See
    // src/api/infrastructure.ts for the canonical route handlers.
    "/api/infrastructure/containers": {
      get: {
        tags: ["Infrastructure"],
        summary: "List containers with current CPU/memory/network stats",
        description:
          "Returns a live snapshot of Docker containers with resource usage. " +
          "Use ?hostId=<id> to query a remote agent-backed host (multi-host fleet mode).",
        parameters: [queryStr("hostId")],
        responses: {
          200: { description: "Container list with stats and 24h log counts" },
          503: { description: "Docker unavailable" },
        },
      },
    },
    "/api/infrastructure/containers/{id}": {
      get: {
        tags: ["Infrastructure"],
        summary: "Container stats history over a time window",
        parameters: [
          param("id", "path", { type: "string" }, true),
          param("from", "query", { type: "string", format: "date-time" }),
          param("to", "query", { type: "string", format: "date-time" }),
          queryStr("hostId"),
        ],
        responses: { 200: { description: "Container stats history" } },
      },
    },
    "/api/infrastructure/host": {
      get: {
        tags: ["Infrastructure"],
        summary: "Current host metrics (CPU, memory, disk, load, network)",
        description:
          "Returns a live snapshot of host metrics. With ?hostId=local it probes " +
          "the local host directly; with any other hostId it queries the most recent " +
          "sample submitted via /api/agent/ingest.",
        parameters: [queryStr("hostId")],
        responses: {
          200: { description: "Host metrics" },
          404: { description: "Host not found" },
          503: { description: "Host stats unavailable" },
        },
      },
    },
    "/api/infrastructure/host/history": {
      get: {
        tags: ["Infrastructure"],
        summary: "Host metric history over a time window",
        parameters: [
          param("from", "query", { type: "string", format: "date-time" }),
          param("to", "query", { type: "string", format: "date-time" }),
          queryStr("hostId"),
        ],
        responses: { 200: { description: "Host metric history" } },
      },
    },
    "/api/infrastructure/overview": {
      get: {
        tags: ["Infrastructure"],
        summary: "High-level infrastructure overview (current + latest persisted)",
        description:
          "Aggregates current Docker stats + host stats alongside the latest persisted " +
          "snapshot in a single response — useful for landing-page tiles.",
        parameters: [queryStr("hostId")],
        responses: {
          200: { description: "Infrastructure overview" },
          503: { description: "Overview unavailable" },
        },
      },
    },

    // ── [3.2] Badges ──────────────────────────────────────────────────────
    // SVG/PNG shields.io-style badges for embedding in READMEs and status pages.
    // See src/api/badges.ts.
    "/api/badges/uptime/{slug}/{id}": {
      get: {
        tags: ["Badges"],
        summary: "Uptime percentage badge for a project monitor",
        description:
          "Returns a shields.io-style badge showing the 24h uptime percentage for the " +
          "primary monitor of the given project slug. Color band: green ≥99.9%, " +
          "yellow ≥99%, orange ≥95%, red below.",
        parameters: [
          param("slug", "path", { type: "string" }, true),
          param("id", "path", { type: "string" }, true),
        ],
        security: [],
        responses: {
          200: {
            description: "Badge image",
            content: {
              "image/svg+xml": { schema: { type: "string" } },
              "image/png": { schema: { type: "string", format: "binary" } },
            },
          },
        },
      },
    },
    "/api/badges/incidents/{slug}/{id}": {
      get: {
        tags: ["Badges"],
        summary: "Open-incidents badge for a project",
        description:
          "Returns a shields.io-style badge reflecting whether the project currently " +
          "has any open (non-resolved) incidents.",
        parameters: [
          param("slug", "path", { type: "string" }, true),
          param("id", "path", { type: "string" }, true),
        ],
        security: [],
        responses: {
          200: {
            description: "Badge image",
            content: {
              "image/svg+xml": { schema: { type: "string" } },
              "image/png": { schema: { type: "string", format: "binary" } },
            },
          },
        },
      },
    },

    // ── [3.3] Fingerprint Rules ────────────────────────────────────────────
    // Custom regex-based fingerprinting rules (issue grouping).
    // See src/api/fingerprint-rules.ts.
    "/api/fingerprint-rules": {
      get: {
        tags: ["Fingerprint Rules"],
        summary: "List custom fingerprinting rules for a project",
        parameters: [queryUuid("projectId"), queryStr("limit"), queryStr("offset")],
        responses: {
          200: {
            description: "Paginated rule list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { type: "object" } },
                    total: { type: "integer" },
                    limit: { type: "integer" },
                    offset: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Fingerprint Rules"],
        summary: "Create a custom fingerprinting rule",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["projectId", "name", "pattern"],
                properties: {
                  projectId: { type: "string", format: "uuid" },
                  name: { type: "string", minLength: 1, maxLength: 100 },
                  pattern: { type: "string", minLength: 1, maxLength: 500 },
                  groupBy: { type: "string", enum: ["message", "stack", "type"] },
                  isActive: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Rule created" },
          400: { description: "Invalid regex pattern or groupBy" },
          409: { description: "Rule name already exists for this project" },
        },
      },
    },
    "/api/fingerprint-rules/{id}": {
      get: {
        tags: ["Fingerprint Rules"],
        summary: "Get a fingerprinting rule",
        parameters: [pathUuid],
        responses: { 200: { description: "Rule detail" }, 404: { description: "Not found" } },
      },
      put: {
        tags: ["Fingerprint Rules"],
        summary: "Update a fingerprinting rule",
        parameters: [pathUuid],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", minLength: 1, maxLength: 100 },
                  pattern: { type: "string", minLength: 1, maxLength: 500 },
                  groupBy: { type: "string", enum: ["message", "stack", "type"] },
                  isActive: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Rule updated" },
          400: { description: "Invalid regex pattern" },
          404: { description: "Not found" },
        },
      },
      delete: {
        tags: ["Fingerprint Rules"],
        summary: "Delete a fingerprinting rule",
        parameters: [pathUuid],
        responses: { 200: { description: "Rule deleted" }, 404: { description: "Not found" } },
      },
    },

    // ── [3.4] Saved Searches ───────────────────────────────────────────────
    // Persisted cross-resource search queries.
    // See src/api/saved-searches.ts.
    "/api/saved-searches": {
      get: {
        tags: ["Saved Searches"],
        summary: "List saved searches",
        parameters: [queryStr("projectId")],
        responses: { 200: { description: "Saved search list" } },
      },
      post: {
        tags: ["Saved Searches"],
        summary: "Create a saved search",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "query"],
                properties: {
                  name: { type: "string" },
                  query: { type: "string" },
                  filters: { type: "object", additionalProperties: true },
                  projectId: { type: "string" },
                },
              },
            },
          },
        },
        responses: { 200: { description: "Saved search created" } },
      },
    },
    "/api/saved-searches/{id}": {
      delete: {
        tags: ["Saved Searches"],
        summary: "Delete a saved search",
        parameters: [param("id", "path", { type: "string" }, true)],
        responses: {
          200: { description: "Saved search deleted" },
          404: { description: "Not found" },
        },
      },
    },

    // ── [3.5] Subscribers ──────────────────────────────────────────────────
    // Status page email subscribers. The /public endpoint is intentionally
    // unauthenticated so status pages can host a sign-up form.
    // See src/api/subscribers.ts.
    "/api/subscribers": {
      get: {
        tags: ["Subscribers"],
        summary: "List status-page subscribers for the caller's project",
        parameters: [
          queryStr("projectId"),
          param("limit", "query", { type: "integer", minimum: 1, maximum: 500 }),
          param("offset", "query", { type: "integer", minimum: 0 }),
        ],
        responses: {
          200: {
            description: "Paginated subscriber list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { type: "object" } },
                    total: { type: "integer" },
                    limit: { type: "integer" },
                    offset: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Subscribers"],
        summary: "Add a subscriber (admin)",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["projectId", "email"],
                properties: {
                  projectId: { type: "string" },
                  email: { type: "string", format: "email" },
                  autoVerify: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Subscriber added" },
          400: { description: "Invalid email" },
          409: { description: "Already subscribed" },
        },
      },
    },
    "/api/subscribers/public": {
      post: {
        tags: ["Subscribers"],
        summary: "Public subscribe (no auth) — anyone can sign up from a status page",
        description:
          "Public sign-up endpoint exposed on status pages. Does NOT require an API " +
          "key — only validates the email shape and project existence. Subscriber is " +
          "created in unverified state.",
        security: [],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["projectId", "email"],
                properties: {
                  projectId: { type: "string" },
                  email: { type: "string", format: "email" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Subscriber added (unverified)" },
          400: { description: "Invalid email" },
          404: { description: "Project not found" },
          409: { description: "Already subscribed" },
        },
      },
    },
    "/api/subscribers/{id}": {
      delete: {
        tags: ["Subscribers"],
        summary: "Remove a subscriber",
        parameters: [param("id", "path", { type: "string" }, true)],
        responses: {
          200: { description: "Subscriber removed" },
          403: { description: "Forbidden (subscriber belongs to another project)" },
          404: { description: "Not found" },
        },
      },
    },
    "/api/subscribers/{id}/verify": {
      post: {
        tags: ["Subscribers"],
        summary: "Mark a subscriber as verified",
        parameters: [param("id", "path", { type: "string" }, true)],
        responses: {
          200: { description: "Subscriber verified" },
          403: { description: "Forbidden (subscriber belongs to another project)" },
          404: { description: "Not found" },
        },
      },
    },

    // ── [3.6] Agent Ingest ─────────────────────────────────────────────────
    // Lightweight multi-host monitoring agent endpoint. Receives host, container,
    // and GPU telemetry batches from remote agents.
    // See src/api/agent-ingest.ts.
    "/api/agent/ingest": {
      post: {
        tags: ["Agent Ingest"],
        summary: "Ingest a batch of host/container/GPU telemetry from a remote agent",
        description:
          "Per-host rate limit: 60 req/min (Redis-backed when available, in-memory " +
          "fallback otherwise). On a 429 the agent should back off and retry.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["hostId", "hostStats", "containers"],
                properties: {
                  hostId: { type: "string" },
                  hostStats: {
                    type: "object",
                    required: ["cpu", "memory", "disk", "load", "network"],
                    properties: {
                      cpu: { type: "number" },
                      memory: { type: "number" },
                      disk: { type: "number" },
                      load: { type: "array", items: { type: "number" } },
                      network: {
                        type: "object",
                        required: ["rx", "tx"],
                        properties: {
                          rx: { type: "number" },
                          tx: { type: "number" },
                        },
                      },
                      cores: { type: "array", items: { type: "number" } },
                    },
                  },
                  containers: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["id", "name", "cpu", "memory"],
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        cpu: { type: "number" },
                        memory: { type: "number" },
                        memoryLimit: { type: "number" },
                        memoryPercent: { type: "number" },
                        networkRx: { type: "number" },
                        networkTx: { type: "number" },
                        networkRxRate: { type: "number" },
                        networkTxRate: { type: "number" },
                        blockRead: { type: "number" },
                        blockWrite: { type: "number" },
                        status: { type: "string" },
                        uptimeSeconds: { type: "number" },
                        restartCount: { type: "number" },
                        healthStatus: { type: "string" },
                        image: { type: "string" },
                      },
                    },
                  },
                  gpu: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["gpuIndex", "utilizationPercent", "memoryUsedMb", "memoryTotalMb"],
                      properties: {
                        gpuIndex: { type: "integer" },
                        utilizationPercent: { type: "number" },
                        memoryUsedMb: { type: "number" },
                        memoryTotalMb: { type: "number" },
                        temperatureC: { type: "number", nullable: true },
                      },
                    },
                  },
                  hostInfo: {
                    type: "object",
                    properties: {
                      os: { type: "string" },
                      kernel: { type: "string" },
                      cpuModel: { type: "string" },
                      cores: { type: "integer" },
                      arch: { type: "string" },
                      uptime: { type: "number" },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Ingest accepted" },
          429: { description: "Per-host rate limit exceeded (60 req/min)" },
          500: { description: "Ingest failed" },
        },
      },
    },

    // ── [3.7] Export ───────────────────────────────────────────────────────
    // CSV/JSON export for issues, traces, logs. Range clamped to 90 days,
    // 10k row cap per request.
    // See src/api/export.ts.
    "/api/export/issues": {
      get: {
        tags: ["Export"],
        summary: "Export issues as JSON or CSV (default 30d window, max 90d, 10k rows)",
        parameters: [
          param("format", "query", { type: "string", enum: ["json", "csv"] }),
          param("from", "query", { type: "string", format: "date-time" }),
          param("to", "query", { type: "string", format: "date-time" }),
        ],
        responses: {
          200: {
            description: "Issue export (JSON or CSV)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { type: "object" } },
                    count: { type: "integer" },
                  },
                },
              },
              "text/csv": { schema: { type: "string" } },
            },
          },
        },
      },
    },
    "/api/export/traces": {
      get: {
        tags: ["Export"],
        summary: "Export traces as JSON or CSV (default 7d window, max 90d, 10k rows)",
        parameters: [
          param("format", "query", { type: "string", enum: ["json", "csv"] }),
          param("from", "query", { type: "string", format: "date-time" }),
          param("to", "query", { type: "string", format: "date-time" }),
        ],
        responses: {
          200: {
            description: "Trace export (JSON or CSV)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { type: "object" } },
                    count: { type: "integer" },
                  },
                },
              },
              "text/csv": { schema: { type: "string" } },
            },
          },
        },
      },
    },
    "/api/export/logs": {
      get: {
        tags: ["Export"],
        summary: "Export logs as JSON or CSV (default 7d window, max 90d, 10k rows)",
        parameters: [
          param("format", "query", { type: "string", enum: ["json", "csv"] }),
          param("from", "query", { type: "string", format: "date-time" }),
          param("to", "query", { type: "string", format: "date-time" }),
          queryStr("level"),
          queryStr("container"),
        ],
        responses: {
          200: {
            description: "Log export (JSON or CSV)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { type: "object" } },
                    count: { type: "integer" },
                  },
                },
              },
              "text/csv": { schema: { type: "string" } },
            },
          },
        },
      },
    },

    // ── [3.8] Source Maps ──────────────────────────────────────────────────
    // Upload + retrieve source maps for stack trace deobfuscation.
    // Files are stored under ./sourcemaps/<projectId>/<release>.map.
    // See src/api/sourcemaps.ts.
    "/api/sourcemaps/{projectId}": {
      post: {
        tags: ["Source Maps"],
        summary: "Upload a source map for a release (multipart/form-data)",
        parameters: [param("projectId", "path", { type: "string", format: "uuid" }, true)],
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file", "release"],
                properties: {
                  file: { type: "string", format: "binary" },
                  release: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Source map uploaded",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    uploaded: { type: "boolean" },
                    projectId: { type: "string", format: "uuid" },
                    release: { type: "string" },
                    size: { type: "integer" },
                  },
                },
              },
            },
          },
          400: { description: "Missing file or release field" },
          500: { description: "Upload failed" },
        },
      },
      get: {
        tags: ["Source Maps"],
        summary: "List uploaded source maps (releases) for a project",
        parameters: [param("projectId", "path", { type: "string", format: "uuid" }, true)],
        responses: {
          200: {
            description: "Releases with uploaded source maps",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    releases: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/sourcemaps/{projectId}/{release}": {
      get: {
        tags: ["Source Maps"],
        summary: "Download a source map JSON",
        parameters: [
          param("projectId", "path", { type: "string", format: "uuid" }, true),
          param("release", "path", { type: "string" }, true),
        ],
        responses: {
          200: {
            description: "Source map JSON",
            content: { "application/json": { schema: { type: "object" } } },
          },
          404: { description: "Source map not found" },
        },
      },
      delete: {
        tags: ["Source Maps"],
        summary: "Delete a source map",
        parameters: [
          param("projectId", "path", { type: "string", format: "uuid" }, true),
          param("release", "path", { type: "string" }, true),
        ],
        responses: {
          200: { description: "Source map deleted" },
          404: { description: "Source map not found" },
        },
      },
    },

    // ── [3.9] Admin Bridge ─────────────────────────────────────────────────
    // Server-to-server endpoints used by hiai-admin-proxy to manage per-tenant
    // observe projects (create + rotate keys + tenant lookup).
    // All routes require ADMIN_API_KEY. See src/api/admin-bridge.ts.
    "/api/admin/projects": {
      get: {
        tags: ["Admin Bridge"],
        summary: "List projects (admin-proxy bootstrap)",
        description: "Requires ADMIN_API_KEY in Authorization: Bearer header.",
        responses: {
          200: { description: "Project list with keyPrefix/tenantId metadata" },
          401: { description: "Unauthorized" },
        },
      },
      post: {
        tags: ["Admin Bridge"],
        summary: "Create a project + mint API key (idempotent on tenantId)",
        description:
          "If a project already exists for the supplied tenantId, its key is " +
          "rotated and the same record returned with `rotated: true`. The plaintext " +
          "API key is returned ONCE — admin-proxy must store it immediately.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string", minLength: 1, maxLength: 100 },
                  tenantId: { type: "string", minLength: 1, maxLength: 128 },
                  apiRole: { type: "string", enum: ["admin", "member", "readonly"] },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: "Project created (or key rotated on existing tenant)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    project: { type: "object" },
                    apiKey: { type: "string" },
                    rotated: { type: "boolean" },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorized" },
        },
      },
    },
    "/api/admin/projects/{id}/rotate-key": {
      post: {
        tags: ["Admin Bridge"],
        summary: "Force rotation of a project's API key",
        parameters: [param("id", "path", { type: "string", format: "uuid" }, true)],
        responses: {
          200: {
            description: "New API key generated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    project: { type: "object" },
                    apiKey: { type: "string" },
                    apiKeyPreview: { type: "string" },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorized" },
          404: { description: "Project not found" },
        },
      },
    },
    "/api/admin/tenants/{tenantId}": {
      get: {
        tags: ["Admin Bridge"],
        summary: "Resolve tenant_id → observe project (admin-proxy lookup)",
        description:
          "Returns 404 when the tenant is not provisioned; admin-proxy treats this " +
          "as a 'needs provisioning' signal and calls POST /api/admin/projects.",
        parameters: [
          param("tenantId", "path", { type: "string", minLength: 1, maxLength: 128 }, true),
        ],
        responses: {
          200: {
            description: "Tenant → project mapping",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tenantId: { type: "string" },
                    project: { type: "object" },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorized" },
          404: { description: "Tenant not provisioned in observe" },
        },
      },
    },

    // ── [3.10] Tenant Health ───────────────────────────────────────────────
    // Cross-project rollup for tenants managed by hiai-admin.
    // See src/api/tenant-health.ts.
    "/api/tenant/{tenantId}/health": {
      get: {
        tags: ["Tenant Health"],
        summary: "Aggregate health for a tenant (requires ADMIN_API_KEY)",
        description:
          "Cross-project rollup: returns the projects bound to the tenant, total + " +
          "open issue counts, average monitor uptime (24h), and the most recent error. " +
          "Empty tenants return zeroed numerics (200) rather than 404 — the tenant " +
          "id is opaque and a missing match is a valid 'no projects bound' state.",
        parameters: [
          param("tenantId", "path", { type: "string", minLength: 1, maxLength: 128 }, true),
        ],
        responses: {
          200: {
            description: "Tenant health summary",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tenantId: { type: "string" },
                    projects: { type: "integer" },
                    totalIssues: { type: "integer" },
                    openIssues: { type: "integer" },
                    avgUptime: { type: "number" },
                    lastError: {
                      type: "object",
                      nullable: true,
                      properties: {
                        ago: { type: "string" },
                        message: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorized (missing/invalid admin key)" },
          503: { description: "Admin key not configured on server" },
        },
      },
    },

    // ── [3.11] Status Pages ────────────────────────────────────────────────
    // Public, unauthenticated status page JSON (consumed by status-page-html
    // renderer and by external embed consumers). See src/api/status-page.ts.
    "/api/status/{slug}": {
      get: {
        tags: ["Status Pages"],
        summary: "Public status page JSON (no auth)",
        description:
          "Returns the overall status (operational | degraded | down), the list of " +
          "monitors with last-check + 24h uptime, and any currently active incidents.",
        parameters: [param("slug", "path", { type: "string" }, true)],
        security: [],
        responses: {
          200: {
            description: "Status summary",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    project: { type: "object" },
                    overall: { type: "string", enum: ["operational", "degraded", "down"] },
                    monitors: { type: "array", items: { type: "object" } },
                    incidents: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
          404: { description: "Status page not found" },
        },
      },
    },
    "/api/status/{slug}/history": {
      get: {
        tags: ["Status Pages"],
        summary: "Public per-monitor uptime history (no auth)",
        parameters: [
          param("slug", "path", { type: "string" }, true),
          param("days", "query", { type: "integer", minimum: 1, maximum: 90 }),
        ],
        security: [],
        responses: {
          200: {
            description: "Uptime history",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    history: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          monitorId: { type: "string" },
                          name: { type: "string" },
                          uptimePercent: { type: "number" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          404: { description: "Status page not found" },
        },
      },
    },

    // ── [3.12] WebSocket — Live log streaming ──────────────────────────────
    // OpenAPI 3.0.x has no native WebSocket support. We document /ws/logs using
    // the standard `x-websocket` extension so generated clients know this is a
    // long-lived connection rather than an HTTP request/response. The canonical
    // handler lives in src/api/logs-ws.ts.
    "/ws/logs": {
      get: {
        tags: ["Logs"],
        summary: "WebSocket live log streaming",
        description:
          "Long-lived WebSocket connection for streaming container logs in real time. " +
          'Authentication is performed via the first message `{ action: "auth", key: "<apikey>" }` ' +
          "— query-string auth is NOT accepted (would leak the key via server logs / " +
          "browser history / proxy headers). After auth, send " +
          '`{ action: "subscribe", containerId: "..." }` to subscribe to a single ' +
          'container, or `{ action: "subscribe_all" }` to receive every log entry ' +
          'for the project. Send `{ action: "unsubscribe" }` to drop all subscriptions. ' +
          'Server emits `{ type: "log", data }` for each entry and `{ type: "ping" }` ' +
          "every 30s as a keepalive.",
        responses: {
          101: { description: "Switching Protocols — WebSocket handshake accepted" },
          4001: { description: "Unauthorized — invalid or missing API key on auth message" },
        },
        "x-websocket": {
          url: "/ws/logs",
          protocol: "ws",
          authentication: {
            type: "first-message",
            message: { action: "auth", key: "<apikey>" },
          },
          messages: [
            {
              direction: "client→server",
              type: "auth",
              schema: { action: "auth", key: "<apikey>" },
            },
            {
              direction: "client→server",
              type: "subscribe",
              schema: { action: "subscribe", containerId: "<id>" },
            },
            {
              direction: "client→server",
              type: "subscribe_all",
              schema: { action: "subscribe_all" },
            },
            {
              direction: "client→server",
              type: "unsubscribe",
              schema: { action: "unsubscribe" },
            },
            {
              direction: "server→client",
              type: "log",
              schema: { type: "log", data: "<LogEntry>" },
            },
            {
              direction: "server→client",
              type: "recent",
              schema: { type: "recent", data: ["<LogEntry>"] },
            },
            {
              direction: "server→client",
              type: "ping",
              schema: { type: "ping" },
            },
          ],
        },
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
      {
        name: "Embed",
        description: "Iframe-friendly embed endpoints for hiai-dashboard integration",
      },
      { name: "Releases", description: "Release tracking" },
      { name: "Team", description: "Team member management" },
      { name: "Comments", description: "Issue comments" },
      { name: "Maintenance", description: "Maintenance windows" },
      { name: "Incidents", description: "Incident lifecycle" },
      { name: "Notifications", description: "Notification channel config" },
      { name: "Search", description: "Cross-project search" },
      { name: "Infrastructure", description: "Host and container metrics" },
      { name: "Badges", description: "Status badge / shield generation" },
      { name: "Fingerprint Rules", description: "Custom error fingerprinting rules" },
      { name: "Saved Searches", description: "Persisted search queries" },
      { name: "Subscribers", description: "Status page email subscribers" },
      { name: "Agent Ingest", description: "AI agent telemetry ingestion endpoint" },
      { name: "Export", description: "Data export endpoints (CSV/JSON)" },
      { name: "Source Maps", description: "Source map upload and retrieval" },
      { name: "Admin Bridge", description: "Cross-tenant admin bridge for hiai-admin" },
      { name: "Tenant Health", description: "Per-tenant aggregate health status" },
      { name: "Status Pages", description: "Public status page endpoints" },
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
export const openapiRoutes = new Elysia({ prefix: "/api" }).get("/openapi.json", () => buildSpec());
