/**
 * Releases API
 *
 * CRUD for releases with health metrics:
 * new issues count, error rate, and health score per release.
 */

import { and, count, desc, eq, gte } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { parseLimit, parseOffset } from "../lib/pagination.js";
import { db } from "../store/db.js";
import { events, issues, releases } from "../store/schema.js";

const VALID_ENVIRONMENTS = ["production", "staging", "development"] as const;

export const releasesRoutes = new Elysia({ prefix: "/api/releases" })

  // ── List releases for a project ─────────────────────────────────────
  .get(
    "/",
    async ({ query }) => {
      const { projectId, environment, limit = "50", offset = "0" } = query;
      const lim = parseLimit(limit);
      const off = parseOffset(offset);

      const conditions = [];
      if (projectId) conditions.push(eq(releases.projectId, projectId));
      if (environment) conditions.push(eq(releases.environment, environment));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, totalResult] = await Promise.all([
        db
          .select()
          .from(releases)
          .where(where)
          .orderBy(desc(releases.createdAt))
          .limit(lim)
          .offset(off),
        db.select({ total: count() }).from(releases).where(where),
      ]);

      return {
        data: items,
        total: totalResult[0]?.total ?? 0,
        limit: lim,
        offset: off,
      };
    },
    {
      query: t.Object({
        projectId: t.Optional(t.String({ format: "uuid" })),
        environment: t.Optional(t.Union(VALID_ENVIRONMENTS.map((e) => t.Literal(e)))),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    },
  )

  // ── Get single release ──────────────────────────────────────────────
  .get(
    "/:id",
    async ({ params, set }) => {
      const [release] = await db.select().from(releases).where(eq(releases.id, params.id)).limit(1);
      if (!release) {
        set.status = 404;
        return { error: "Release not found" };
      }
      return release;
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  // ── Create release ──────────────────────────────────────────────────
  .post(
    "/",
    async ({ body, set }) => {
      const [created] = await db
        .insert(releases)
        .values({
          projectId: body.projectId,
          version: body.version,
          environment: body.environment ?? "production",
          deployedAt: body.deployedAt ? new Date(body.deployedAt) : null,
        })
        .returning();

      set.status = 201;
      return created;
    },
    {
      body: t.Object({
        projectId: t.String({ format: "uuid" }),
        version: t.String({ minLength: 1 }),
        environment: t.Optional(t.Union(VALID_ENVIRONMENTS.map((e) => t.Literal(e)))),
        deployedAt: t.Optional(t.String({ format: "date-time" })),
      }),
    },
  )

  // ── Update release (deployedAt) ─────────────────────────────────────
  .put(
    "/:id",
    async ({ params, body, set }) => {
      const [existing] = await db
        .select()
        .from(releases)
        .where(eq(releases.id, params.id))
        .limit(1);
      if (!existing) {
        set.status = 404;
        return { error: "Release not found" };
      }

      const updateData: Record<string, unknown> = {};
      if (body.deployedAt !== undefined) updateData.deployedAt = new Date(body.deployedAt);
      if (body.version !== undefined) updateData.version = body.version;
      if (body.environment !== undefined) updateData.environment = body.environment;

      if (Object.keys(updateData).length === 0) {
        set.status = 400;
        return { error: "No valid fields to update" };
      }

      const [updated] = await db
        .update(releases)
        .set(updateData)
        .where(eq(releases.id, params.id))
        .returning();

      return updated;
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        version: t.Optional(t.String({ minLength: 1 })),
        environment: t.Optional(t.Union(VALID_ENVIRONMENTS.map((e) => t.Literal(e)))),
        deployedAt: t.Optional(t.String({ format: "date-time" })),
      }),
    },
  )

  // ── Release health ──────────────────────────────────────────────────
  .get(
    "/:id/health",
    async ({ params, set }) => {
      const [release] = await db.select().from(releases).where(eq(releases.id, params.id)).limit(1);
      if (!release) {
        set.status = 404;
        return { error: "Release not found" };
      }

      const releaseTime = release.deployedAt ?? release.createdAt;
      const now = new Date();
      const windowHours = Math.max(1, (now.getTime() - releaseTime.getTime()) / (1000 * 60 * 60));

      // Count new issues first seen after release
      const newIssuesResult = await db
        .select({ total: count() })
        .from(issues)
        .where(and(eq(issues.projectId, release.projectId), gte(issues.firstSeen, releaseTime)));

      const newIssuesCount = newIssuesResult[0]?.total ?? 0;

      // Count total events after release
      const eventsResult = await db
        .select({ total: count() })
        .from(events)
        .where(and(eq(events.projectId, release.projectId), gte(events.createdAt, releaseTime)));

      const totalEvents = eventsResult[0]?.total ?? 0;
      const errorRate = windowHours > 0 ? Math.round((totalEvents / windowHours) * 100) / 100 : 0;

      // Health score: green (<5 new issues/hr), yellow (<20), red (>=20)
      const newIssuesRate = windowHours > 0 ? newIssuesCount / windowHours : 0;
      let healthScore: "green" | "yellow" | "red";
      if (newIssuesRate < 5) healthScore = "green";
      else if (newIssuesRate < 20) healthScore = "yellow";
      else healthScore = "red";

      return {
        releaseId: release.id,
        version: release.version,
        environment: release.environment,
        newIssuesCount,
        errorRate,
        healthScore,
        windowHours: Math.round(windowHours * 100) / 100,
      };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  // ── Delete release ──────────────────────────────────────────────────
  .delete(
    "/:id",
    async ({ params, set }) => {
      const [existing] = await db
        .select({ id: releases.id })
        .from(releases)
        .where(eq(releases.id, params.id))
        .limit(1);
      if (!existing) {
        set.status = 404;
        return { error: "Release not found" };
      }

      await db.delete(releases).where(eq(releases.id, params.id));
      return { deleted: true };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
