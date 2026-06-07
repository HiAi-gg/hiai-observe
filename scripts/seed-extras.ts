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
import { db } from "../src/store/db.js";
import {
  projects, incidents, releases, fingerprintRules, teamMembers,
  maintenanceWindows, uptimeMonitors,
} from "../src/store/schema.js";
import { eq } from "drizzle-orm";

const slug = process.argv[2] ?? "demo";

function daysFromNow(d: number): Date {
  return new Date(Date.now() + d * 24 * 60 * 60 * 1000);
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

  await db.insert(incidents).values([
    { projectId: pid, monitorId, title: "Elevated API latency", status: "monitoring", severity: "major", description: "p95 latency above 2s on the checkout API." },
    { projectId: pid, monitorId, title: "Payment webhook failures", status: "investigating", severity: "critical", description: "Stripe webhooks returning 500 intermittently." },
    { projectId: pid, title: "Search degraded", status: "resolved", severity: "minor", description: "Full-text search was slow; index rebuilt." },
  ]);

  await db.insert(releases).values([
    { projectId: pid, version: "v1.4.0", environment: "production", deployedAt: daysFromNow(-7) },
    { projectId: pid, version: "v1.4.1", environment: "production", deployedAt: daysFromNow(-3) },
    { projectId: pid, version: "v1.5.0-rc.1", environment: "staging", deployedAt: daysFromNow(-1) },
  ]);

  await db.insert(fingerprintRules).values([
    { projectId: pid, name: "Group timeouts", pattern: "ETIMEDOUT|timed out", groupBy: "message", isActive: true },
    { projectId: pid, name: "Group DB errors", pattern: "PostgresError|ECONNREFUSED", groupBy: "type", isActive: true },
    { projectId: pid, name: "Ignore healthchecks", pattern: "/health", groupBy: null, isActive: false },
  ]);

  await db.insert(teamMembers).values([
    { projectId: pid, name: "Ada Lovelace", email: "ada@example.com", role: "admin" },
    { projectId: pid, name: "Alan Turing", email: "alan@example.com", role: "member" },
    { projectId: pid, name: "Grace Hopper", email: "grace@example.com", role: "member" },
    { projectId: pid, name: "Katherine Johnson", email: "katherine@example.com", role: "readonly" },
  ]);

  await db.insert(maintenanceWindows).values([
    { projectId: pid, name: "Database upgrade", description: "Postgres 18 minor upgrade.", startsAt: daysFromNow(2), endsAt: daysFromNow(2.05) },
    { projectId: pid, name: "Network migration", description: "Moving to the new VPC.", startsAt: daysFromNow(-1), endsAt: daysFromNow(-0.9) },
  ]);

  console.log(`Topped up project "${project.name}" (${pid}) with incidents, releases, fingerprint rules, team members, and maintenance windows.`);
}

main().then(() => process.exit(0)).catch((err) => { console.error("Failed:", err); process.exit(1); });
