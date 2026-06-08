/**
 * Non-destructive demo top-up. Adds the entity types that seed-demo.ts does not
 * cover (incidents, releases, fingerprint rules, team members, maintenance
 * windows) to a single project so every UI page has data for screenshots.
 *
 * Unlike seed-demo.ts this does NOT delete anything. It targets one project by
 * slug (default: "demo") and is safe to run against a database with real data.
 *
 * Run: bun run scripts/seed-extras.ts [project-slug]
 */
import { randomUUID } from "node:crypto";
import { db } from "../src/store/db.js";
import {
  projects, incidents, releases, fingerprintRules, teamMembers,
  maintenanceWindows, uptimeMonitors, traces,
} from "../src/store/schema.js";
import { and, eq } from "drizzle-orm";

const slug = process.argv[2] ?? "demo";

function daysFromNow(d: number): Date {
  return new Date(Date.now() + d * 24 * 60 * 60 * 1000);
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** Insert LLM generation spans with gen_ai.* + mastra.* attributes so the AI
 *  Cost / token-usage views have data (grouped by model, agent, and workflow). */
async function seedLlmTraces(pid: string): Promise<number> {
  const models = ["gpt-4o", "gpt-4o-mini", "claude-sonnet-4", "claude-3.5-haiku", "gemini-2.0-flash"];
  const agents = ["researcher", "writer", "code-reviewer", "support-agent"];
  const workflows = ["content-pipeline", "code-review", "support-triage"];
  const rows = [];
  for (let i = 0; i < 60; i++) {
    const model = pick(models);
    const prompt = randInt(400, 6000);
    const completion = randInt(150, 2500);
    const total = prompt + completion;
    const start = new Date(Date.now() - randInt(1, 1440) * 60 * 1000); // within last 24h
    const durationMs = randInt(300, 9000);
    rows.push({
      projectId: pid,
      traceId: randomUUID(),
      spanId: randomUUID(),
      name: "llm.generate",
      kind: "llm",
      status: Math.random() < 0.06 ? "error" : "ok",
      startTime: start,
      endTime: new Date(start.getTime() + durationMs),
      durationMs,
      model,
      tokenUsage: { prompt, completion, total },
      attributes: {
        "gen_ai.request.model": model,
        "gen_ai.usage.prompt_tokens": String(prompt),
        "gen_ai.usage.completion_tokens": String(completion),
        "gen_ai.usage.total_tokens": String(total),
        "mastra.agent": pick(agents),
        "mastra.workflow": pick(workflows),
      },
    });
  }
  await db.insert(traces).values(rows);
  return rows.length;
}

async function main() {
  const [project] = await db.select().from(projects).where(eq(projects.slug, slug)).limit(1);
  if (!project) {
    console.error(`Project with slug "${slug}" not found. Run \`bun run seed\` first.`);
    process.exit(1);
  }
  const pid = project.id;
  const monitors = await db.select({ id: uptimeMonitors.id }).from(uptimeMonitors).where(eq(uptimeMonitors.projectId, pid));
  const monitorId = monitors[0]?.id ?? null;

  // Idempotent: only seed a table for this project if it has none yet.
  const empty = async (table: typeof incidents | typeof releases | typeof fingerprintRules | typeof teamMembers | typeof maintenanceWindows): Promise<boolean> => {
    const rows = await db.select({ projectId: table.projectId }).from(table).where(eq(table.projectId, pid)).limit(1);
    return rows.length === 0;
  };
  const added: string[] = [];

  if (await empty(incidents)) {
    await db.insert(incidents).values([
      { projectId: pid, monitorId, title: "Elevated API latency", status: "monitoring", severity: "major", description: "p95 latency above 2s on the checkout API." },
      { projectId: pid, monitorId, title: "Payment webhook failures", status: "investigating", severity: "critical", description: "Stripe webhooks returning 500 intermittently." },
      { projectId: pid, title: "Search degraded", status: "resolved", severity: "minor", description: "Full-text search was slow; index rebuilt." },
    ]);
    added.push("incidents");
  }

  if (await empty(releases)) {
    await db.insert(releases).values([
      { projectId: pid, version: "v1.4.0", environment: "production", deployedAt: daysFromNow(-7) },
      { projectId: pid, version: "v1.4.1", environment: "production", deployedAt: daysFromNow(-3) },
      { projectId: pid, version: "v1.5.0-rc.1", environment: "staging", deployedAt: daysFromNow(-1) },
    ]);
    added.push("releases");
  }

  if (await empty(fingerprintRules)) {
    await db.insert(fingerprintRules).values([
      { projectId: pid, name: "Group timeouts", pattern: "ETIMEDOUT|timed out", groupBy: "message", isActive: true },
      { projectId: pid, name: "Group DB errors", pattern: "PostgresError|ECONNREFUSED", groupBy: "type", isActive: true },
      { projectId: pid, name: "Ignore healthchecks", pattern: "/health", groupBy: null, isActive: false },
    ]);
    added.push("fingerprint rules");
  }

  if (await empty(teamMembers)) {
    await db.insert(teamMembers).values([
      { projectId: pid, name: "Ada Lovelace", email: "ada@example.com", role: "admin" },
      { projectId: pid, name: "Alan Turing", email: "alan@example.com", role: "member" },
      { projectId: pid, name: "Grace Hopper", email: "grace@example.com", role: "member" },
      { projectId: pid, name: "Katherine Johnson", email: "katherine@example.com", role: "readonly" },
    ]);
    added.push("team members");
  }

  if (await empty(maintenanceWindows)) {
    await db.insert(maintenanceWindows).values([
      { projectId: pid, name: "Database upgrade", description: "Postgres 18 minor upgrade.", startsAt: daysFromNow(2), endsAt: daysFromNow(2.05) },
      { projectId: pid, name: "Network migration", description: "Moving to the new VPC.", startsAt: daysFromNow(-1), endsAt: daysFromNow(-0.9) },
    ]);
    added.push("maintenance windows");
  }

  // LLM token-usage traces: only seed if this project has none yet.
  const existingLlm = await db
    .select({ id: traces.id })
    .from(traces)
    .where(and(eq(traces.projectId, pid), eq(traces.kind, "llm")))
    .limit(1);
  if (existingLlm.length === 0) {
    const n = await seedLlmTraces(pid);
    added.push(`${n} LLM token-usage traces`);
  }

  console.log(
    added.length > 0
      ? `Topped up project "${project.name}" (${pid}) with: ${added.join(", ")}.`
      : `Project "${project.name}" already had demo extras — nothing to add.`,
  );
}

main().then(() => process.exit(0)).catch((err) => { console.error("Failed:", err); process.exit(1); });
