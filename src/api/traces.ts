import { Elysia, t } from "elysia";
import { badRequest, internal } from "../lib/errors.js";
import { parseLimit, parseOffset } from "../lib/pagination.js";
import { applyScope, assertResourceProject, isScope } from "../lib/project-scope.js";
import { getLatencyStats } from "../mastra/latency-analyzer.js";
import { getTokenUsage } from "../mastra/token-aggregator.js";
import { getTraceDetail, getTraces, getWorkflowRuns } from "../store/traces.js";

export const tracesRoutes = new Elysia({ prefix: "/api/traces" })
  // List traces with filters
  .get(
    "/",
    async ({ query, request, set }) => {
      try {
        const scope = await applyScope({
          request,
          query: query as Record<string, unknown>,
          set,
        });
        if (!isScope(scope)) return scope;

        const {
          traceId,
          workflowName,
          agentName,
          status,
          from,
          to,
          limit = "50",
          offset = "0",
        } = query;

        const result = await getTraces({
          projectId: scope.projectId,
          traceId,
          workflowName,
          agentName,
          status,
          from: from ? new Date(from) : undefined,
          to: to ? new Date(to) : undefined,
          limit: parseLimit(limit),
          offset: parseOffset(offset),
        });

        return result;
      } catch (err) {
        set.status = 500;
        return internal(String(err));
      }
    },
    {
      query: t.Object({
        projectId: t.Optional(t.String()),
        // tenantId is accepted as an alias for projectId. tenantScopePlugin
        // resolves it to the bound project UUID before the handler runs.
        tenantId: t.Optional(t.String()),
        traceId: t.Optional(t.String()),
        workflowName: t.Optional(t.String()),
        agentName: t.Optional(t.String()),
        status: t.Optional(t.String()),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    },
  )

  // Aggregated stats (token usage + latency)
  .get(
    "/stats",
    async ({ query, request, set }) => {
      try {
        const scope = await applyScope({
          request,
          query: query as Record<string, unknown>,
          set,
        });
        if (!isScope(scope)) return scope;

        const { from, to, groupBy = "model" } = query;
        const scopedProjectId = scope.projectId;

        if (!scopedProjectId) {
          set.status = 400;
          return badRequest("projectId is required");
        }

        const [tokenUsage, latency] = await Promise.all([
          getTokenUsage({
            projectId: scopedProjectId,
            from: from ? new Date(from) : undefined,
            to: to ? new Date(to) : undefined,
            groupBy: groupBy as "model" | "agent" | "workflow",
          }),
          getLatencyStats({
            projectId: scopedProjectId,
            from: from ? new Date(from) : undefined,
            to: to ? new Date(to) : undefined,
          }),
        ]);

        return { tokenUsage, latency };
      } catch (err) {
        set.status = 500;
        return internal(String(err));
      }
    },
    {
      query: t.Object({
        projectId: t.String(),
        // tenantId is accepted as an alias for projectId. tenantScopePlugin
        // resolves it to the bound project UUID before the handler runs.
        // The handler still requires `projectId` to be present (after
        // resolution); an unresolved tenant will leave projectId undefined
        // and surface as a 400 from the explicit check below.
        tenantId: t.Optional(t.String()),
        from: t.Optional(t.String()),
        to: t.Optional(t.String()),
        groupBy: t.Optional(t.String()),
      }),
    },
  )

  // List workflow runs
  .get(
    "/workflows",
    async ({ query, request, set }) => {
      try {
        const scope = await applyScope({
          request,
          query: query as Record<string, unknown>,
          set,
        });
        if (!isScope(scope)) return scope;

        const { workflowName, status, limit = "50", offset = "0" } = query;

        const result = await getWorkflowRuns({
          projectId: scope.projectId,
          workflowName,
          status,
          limit: parseLimit(limit),
          offset: parseOffset(offset),
        });

        return result;
      } catch (err) {
        set.status = 500;
        return internal(String(err));
      }
    },
    {
      query: t.Object({
        projectId: t.Optional(t.String()),
        // tenantId is accepted as an alias for projectId. tenantScopePlugin
        // resolves it to the bound project UUID before the handler runs.
        tenantId: t.Optional(t.String()),
        workflowName: t.Optional(t.String()),
        status: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    },
  )

  // Workflow run detail with step timeline
  .get(
    "/workflows/:id",
    async ({ params, request, set }) => {
      try {
        const scope = await applyScope({
          request,
          set,
        });
        if (!isScope(scope)) return scope;

        const result = await getTraceDetail(params.id);
        const rowProjectId = result?.spans[0]?.projectId;
        if (!result || !assertResourceProject(rowProjectId, scope.projectId, scope.admin)) {
          set.status = 404;
          return { error: "Workflow run not found" };
        }
        return result;
      } catch (err) {
        set.status = 500;
        return internal(String(err));
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    },
  )

  // Full trace detail with span tree
  .get(
    "/:id",
    async ({ params, request, set }) => {
      try {
        const scope = await applyScope({
          request,
          set,
        });
        if (!isScope(scope)) return scope;

        const result = await getTraceDetail(params.id);
        const rowProjectId = result?.spans[0]?.projectId;
        if (!result || !assertResourceProject(rowProjectId, scope.projectId, scope.admin)) {
          set.status = 404;
          return { error: "Trace not found" };
        }
        return result;
      } catch (err) {
        set.status = 500;
        return internal(String(err));
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    },
  );
