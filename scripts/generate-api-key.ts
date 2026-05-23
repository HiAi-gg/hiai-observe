/**
 * Generate a new API key for a project.
 * Run: bun run scripts/generate-api-key.ts <project-name>
 */

import { db } from "../src/store/db.js";
import { projects } from "../src/store/schema.js";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";

const projectName = process.argv[2];

if (!projectName) {
  console.error("Usage: bun run scripts/generate-api-key.ts <project-name>");
  console.error("  If the project exists, generates a new key for it.");
  console.error("  If not, creates the project and generates a key.");
  process.exit(1);
}

async function generateKey() {
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const apiKey = `ho_${randomUUID().replace(/-/g, "")}`;

  // Check if project exists
  const existing = await db.select().from(projects).where(eq(projects.slug, slug)).limit(1);

  if (existing[0]) {
    // Update existing project with new key
    const { eq: eqFn } = await import("drizzle-orm");
    await db.update(projects).set({ apiKey }).where(eqFn(projects.id, existing[0].id));
    console.log(`\nUpdated API key for existing project:`);
    console.log(`  Project:  ${existing[0].name}`);
    console.log(`  ID:       ${existing[0].id}`);
    console.log(`  New Key:  ${apiKey}`);
  } else {
    // Create new project
    const id = randomUUID();
    await db.insert(projects).values({ id, name: projectName, slug, apiKey });
    console.log(`\nCreated new project with API key:`);
    console.log(`  Project:  ${projectName}`);
    console.log(`  ID:       ${id}`);
    console.log(`  API Key:  ${apiKey}`);
  }

  console.log(`\nUse in Sentry DSN: http://${apiKey}@localhost:8001/1`);
  console.log(`Use as Bearer:     Authorization: Bearer ${apiKey}`);
}

generateKey().then(() => process.exit(0)).catch((err) => { console.error("Failed:", err); process.exit(1); });
