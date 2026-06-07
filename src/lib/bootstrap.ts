import { db } from "../store/db.js";
import { projects } from "../store/schema.js";
import { hashApiKey, lookupProject } from "./auth.js";
import { logger } from "./logger.js";

/**
 * Ensure a bootstrap project exists for the configured HIAI_OBSERVE_API_KEY.
 *
 * Auth is DB-backed (bcrypt-hashed keys), so a fresh install has no usable key.
 * On startup we provision a single admin project from the env key, making
 * `docker compose up` with HIAI_OBSERVE_API_KEY set immediately usable.
 *
 * Idempotent: does nothing if the key already resolves to a project, and does
 * nothing if no key is configured.
 */
export async function ensureBootstrapProject(
  apiKey: string | undefined,
): Promise<{ created: boolean; projectId?: string }> {
  const key = apiKey?.trim();
  if (!key) return { created: false };

  // Already provisioned? (also covers manually-created projects)
  const existing = await lookupProject(key);
  if (existing) return { created: false, projectId: existing.projectId };

  const { hash, prefix } = await hashApiKey(key);
  const [created] = await db
    .insert(projects)
    .values({
      name: "Default",
      slug: "default",
      apiKeyHash: hash,
      keyPrefix: prefix,
      apiRole: "admin",
    })
    .returning();

  if (!created) throw new Error("Failed to create bootstrap project");

  logger.info("Bootstrap project provisioned from HIAI_OBSERVE_API_KEY", {
    projectId: created.id,
  });
  return { created: true, projectId: created.id };
}
