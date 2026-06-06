import { Elysia, t } from "elysia";
import { getTokenUsage } from "../mastra/token-aggregator.js";
import { getLatencyStats } from "../mastra/latency-analyzer.js";
import {
  getTraces,
  getTraceDetail,
  getWorkflowRuns,
} from "../store/traces.js";
import { badRequest, internal } from "../lib/errors.js";

export const tracesRoutes = new Elysia({ prefix: "/api/traces" })
  // List traces with filters
  .get("/", async ({ query, set }) => {
    try {
      const { projectId, traceId, workflowName, agentName, status, from, to, limit = "50", offset = "0" } = query;

      const result = await getTraces({
        projectId,
        traceId,
        workflowName,
        agentName,
        status,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        limit: Math.min(parseInt(limit, 10) || 50, 200),
        offset: parseInt(offset, 10) || 0,
      });

      return result;
    } catch (err) {
      set.status = 500;
      return internal(String(err));
    }
  }, {
    query: t.Object({
      projectId: t.Optional(t.String()),
      traceId: t.Optional(t.String()),
      workflowName: t.Optional(t.String()),
      agentName: t.Optional(t.String()),
      status: t.Optional(t.String()),
      from: t.Optional(t.String()),
      to: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      offset: t.Optional(t.String()),
    }),
  })

  // Aggregated stats (token usage + latency)
  .get("/stats", async ({ query, set }) => {
    try {
      const { projectId, from, to, groupBy = "model" } = query;

      if (!projectId) {
        set.status = 400;
        return badRequest("projectId is required");
      }

      const [tokenUsage, latency] = await Promise.all([
        getTokenUsage({
          projectId,
          from: from ? new Date(from) : undefined,
          to: to ? new Date(to) : undefined,
          groupBy: groupBy as "model" | "agent" | "workflow",
        }),
        getLatencyStats({
          projectId,
          from: from ? new Date(from) : undefined,
          to: to ? new Date(to) : undefined,
        }),
      ]);

      return { tokenUsage, latency };
    } catch (err) {
      set.status = 500;
      return internal(String(err));
    }
  }, {
    query: t.Object({
      projectId: t.String(),
      from: t.Optional(t.String()),
      to: t.Optional(t.String()),
      groupBy: t.Optional(t.String()),
    }),
  })

  // List workflow runs
  .get("/workflows", async ({ query, set }) => {
    try {
      const { projectId, workflowName, status, limit = "50", offset = "0" } = query;

      const result = await getWorkflowRuns({
        projectId,
        workflowName,
        status,
        limit: Math.min(parseInt(limit, 10) || 50, 200),
        offset: parseInt(offset, 10) || 0,
      });

      return result;
    } catch (err) {
      set.status = 500;
      return internal(String(err));
    }
  }, {
    query: t.Object({
      projectId: t.Optional(t.String()),
      workflowName: t.Optional(t.String()),
      status: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      offset: t.Optional(t.String()),
    }),
  })

  // Workflow run detail with step timeline
  .get("/workflows/:id", async ({ params, set }) => {
    try {
      const result = await getTraceDetail(params.id);
      if (!result) {
        set.status = 404;
        return { error: "Workflow run not found" };
      }
      return result;
    } catch (err) {
      set.status = 500;
      return internal(String(err));
    }
  }, {
    params: t.Object({
      id: t.String(),
    }),
  })

  // Full trace detail with span tree
  .get("/:id", async ({ params, set }) => {
    try {
      const result = await getTraceDetail(params.id);
      if (!result) {
        set.status = 404;
        return { error: "Trace not found" };
      }
      return result;
    } catch (err) {
      set.status = 500;
      return internal(String(err));
    }
  }, {
    params: t.Object({
      id: t.String(),
    }),
  });
