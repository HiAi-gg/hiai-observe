/**
 * Centralised application configuration.
 *
 * Reads ALL environment variables via a single Zod schema (`ConfigSchema`)
 * and freezes the parsed result at module load. The entire codebase must
 * import configuration from this module instead of touching `process.env`
 * directly. This guarantees:
 *
 *   - All env vars are typed (inferred from the schema).
 *   - All env vars are validated at boot — malformed configuration crashes
 *     the process early instead of producing surprises at runtime.
 *   - Defaults declared in one place, not duplicated across files.
 *
 * NOTE: This module deliberately does NOT import `logger.ts` — `logger.ts`
 * imports `config.ts`, so importing it here would create a circular
 * dependency. Validation errors are written via stderr instead.
 */

import { z } from "zod";

// ── Schema ────────────────────────────────────────────────────────────────

const ConfigSchema = z.object({
  // ── Core ────────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(8001),
  /**
   * PostgreSQL connection string. Optional at the schema level so unit tests
   * that don't touch the DB can boot without it; `store/db.ts` falls back to
   * a local-dev connection and hard-errors in production.
   */
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),

  // ── Auth ────────────────────────────────────────────────────────────────
  HIAI_OBSERVE_API_KEY: z.string().optional(),
  ADMIN_API_KEY: z.string().optional(),

  // ── Plugin / host integration ────────────────────────────────────────────
  /** URL for the observe backend when consumed via the plugin proxy. */
  OBSERVE_URL: z.string().url().default("http://localhost:8001"),
  ENCRYPTION_KEY: z.string().optional(),

  // ── CORS ────────────────────────────────────────────────────────────────
  /**
   * Comma-separated origin allowlist for browser-side CORS. Recognised forms:
   *   - "*"            → allow all origins (logs a warning in production)
   *   - "false" / ""   → disable CORS entirely (server-to-server only)
   *   - "https://a,https://b" → allowlist of origins (comma-separated)
   *   - "https://a"    → single origin
   *
   * Empty/missing → no CORS.
   */
  CORS_ORIGIN: z.string().optional(),

  /**
   * Comma-separated origins allowed to frame observe embed routes
   * (/embed/* and /status/*). Combined with the default `'self'` ancestor
   * in the embed CSP. Set to the hiai-dashboard origin (e.g. :3333) when
   * embedding observe tiles inside the dashboard operator panel.
   */
  EMBED_ALLOWED_ORIGINS: z.string().optional(),

  // ── Docker / monitoring collection ──────────────────────────────────────
  DOCKER_SOCKET: z.string().default("/var/run/docker.sock"),
  DOCKER_HOST: z.string().optional(),
  DOCKER_API_VERSION: z.string().optional(),
  COLLECTION_INTERVAL_MS: z.coerce.number().default(30_000),
  /** Comma-separated allowlist (empty = all containers). */
  CONTAINER_INCLUDE: z.string().default(""),
  /** Comma-separated denylist applied after the include filter. */
  CONTAINER_EXCLUDE: z.string().default(""),

  // ── Log worker ──────────────────────────────────────────────────────────
  LOG_INCLUDE_CONTAINERS: z.string().default(""),
  LOG_EXCLUDE_CONTAINERS: z.string().default(""),
  LOG_MAX_LINES_PER_SEC: z.coerce.number().default(1000),
  LOG_MAX_BUFFER_SIZE: z.coerce.number().default(10_000),
  LOG_BATCH_INTERVAL_MS: z.coerce.number().default(500),
  LOG_SAMPLE_RATE: z.coerce.number().default(1.0),
  LOG_MAX_CONCURRENT_INSERTS: z.coerce.number().default(3),
  /** Set to "1" to disable the log stream worker entirely. */
  HIAI_DISABLE_LOG_WORKER: z.string().optional(),

  // ── Rate limiter ────────────────────────────────────────────────────────
  /** Set to "true" to trust X-Forwarded-For from upstream proxies. */
  TRUST_PROXY: z.string().optional(),

  // ── Retention worker ────────────────────────────────────────────────────
  RETENTION_DAYS: z.coerce.number().default(30),

  // ── External health pinger ──────────────────────────────────────────────
  HEALTH_PING_URL: z.string().optional(),

  // ── Status page custom CSS ──────────────────────────────────────────────
  STATUS_PAGE_CSS: z.string().optional(),

  // ── Logging ─────────────────────────────────────────────────────────────
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // ── Model pricing (JSON override, see token-aggregator) ─────────────────
  MODEL_PRICING: z.string().optional(),

  // ── Notifiers ───────────────────────────────────────────────────────────
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  DISCORD_WEBHOOK_URL: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().default("587"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SLACK_WEBHOOK_URL: z.string().optional(),
  WEBHOOK_URL: z.string().optional(),
  WEBHOOK_SECRET: z.string().optional(),
  PAGERDUTY_ROUTING_KEY: z.string().optional(),
  TEAMS_WEBHOOK_URL: z.string().optional(),
  NTFY_TOPIC: z.string().optional(),
  NTFY_SERVER: z.string().optional(),
  GOTIFY_SERVER: z.string().optional(),
  GOTIFY_TOKEN: z.string().optional(),
  PUSHOVER_USER_KEY: z.string().optional(),
  PUSHOVER_TOKEN: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

const parsed = ConfigSchema.safeParse(process.env);
if (!parsed.success) {
  // Surface validation errors immediately at boot; nothing else can run
  // safely with malformed configuration. We can't use the project logger
  // here because it depends on this module.
  process.stderr.write(
    `Invalid environment configuration: ${JSON.stringify(parsed.error.issues, null, 2)}\n`,
  );
  throw new Error(
    `Invalid environment configuration: ${parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ")}`,
  );
}

/**
 * The frozen, validated application configuration.
 * All modules import this constant instead of touching `process.env`.
 */
export const config: Readonly<Config> = Object.freeze(parsed.data);

// ── Startup configuration summary ──────────────────────────────────────────
// Operator-facing helper that reports which env vars were explicitly set in
// the process environment, which ones used the schema default, and which
// optional vars are missing. Used by `src/index.ts` to log a startup banner.
//
// We deliberately avoid importing `logger.ts` here (circular dependency: logger
// imports config). The consumer is expected to feed the result into the
// project logger — this keeps config.ts I/O-free and side-effect-free apart
// from the module-load validation above.

/**
 * Categorise every field declared in `ConfigSchema` according to whether the
 * caller supplied it via `process.env`, the schema fell back to its default,
 * or the field is optional and absent.
 *
 * Set vs default is determined by checking `process.env[key]`:
 *   - present (even empty string)         → "set"
 *   - absent AND schema has a default     → "default"
 *   - absent AND schema is optional       → "missing"
 *
 * For `z.coerce.number().default(N)` the "default" bucket is reported even
 * when the env value is invalid (Zod falls back to the default and the parse
 * succeeds), but a `safeParse` failure on a required field would have already
 * thrown at module load before we ever get here.
 */
export interface ConfigFieldSummary {
  key: string;
  /** "set" → provided via env, "default" → schema default applied, "missing" → optional and absent. */
  status: "set" | "default" | "missing";
  /** The resolved value after parse + defaults. */
  value: unknown;
}

export interface ConfigSummary {
  set: string[];
  defaulted: string[];
  missing: string[];
  fields: ConfigFieldSummary[];
}

function readEnvValue(key: string): unknown {
  const raw = process.env[key];
  if (raw === undefined) return undefined;
  if (raw === "") return ""; // empty string is still "set"
  // Best-effort: return the coerced value via the field schema so the summary
  // reports the post-parse type (number for `coerce.number`, etc.).
  const fieldSchema = (ConfigSchema.shape as Record<string, z.ZodTypeAny>)[key];
  if (!fieldSchema) return raw;
  const single = fieldSchema.safeParse(raw);
  if (single.success) return single.data;
  return raw;
}

export function summarizeConfig(): ConfigSummary {
  const shape = ConfigSchema.shape as Record<string, z.ZodTypeAny>;
  const set: string[] = [];
  const defaulted: string[] = [];
  const missing: string[] = [];
  const fields: ConfigFieldSummary[] = [];

  for (const key of Object.keys(shape).sort()) {
    const fieldSchema = shape[key];
    if (!fieldSchema) continue; // unreachable under Record typing, satisfies noUncheckedIndexedAccess
    const hasDefault = fieldSchema._def?.typeName === "ZodDefault";
    // `.default()` schemas also report `isOptional() === true`. We want a
    // strict "is this purely optional (no default)?" check, so we read it
    // directly from the inner type via `safeParse(undefined)`.
    const innerType = fieldSchema._def?.innerType;
    const isPureOptional = !hasDefault && innerType?.safeParse(undefined).success === true;
    const present = process.env[key] !== undefined;

    let status: ConfigFieldSummary["status"];
    if (present) {
      status = "set";
      set.push(key);
    } else if (hasDefault) {
      status = "default";
      defaulted.push(key);
    } else if (isPureOptional) {
      status = "missing";
      missing.push(key);
    } else {
      // Required with no default and absent → would have thrown at parse.
      // Treat as missing for reporting completeness.
      status = "missing";
      missing.push(key);
    }

    const value = readEnvValue(key);
    fields.push({ key, status, value });
  }

  return { set, defaulted, missing, fields };
}

/**
 * Render the configuration summary as a single structured line suitable for
 * the project logger. Pure function: no I/O, no global side-effects.
 */
export function formatConfigSummary(summary: ConfigSummary): string {
  const total = summary.set.length + summary.defaulted.length + summary.missing.length;
  return (
    `Configuration: ${summary.set.length} set, ${summary.defaulted.length} defaulted, ` +
    `${summary.missing.length} missing optional (${total} total)`
  );
}

// ── MonitoringConfig projection ───────────────────────────────────────────
// The rest of the monitoring code (log-streamer, infra-worker, etc.) reads
// a single `MonitoringConfig` object. It is derived from `config` and
// validated here so the consumer code doesn't have to reach for individual
// env vars.

export interface MonitoringConfig {
  /** Unix socket path — used when DOCKER_HOST is not set. */
  dockerSocket: string;
  /** TCP URL for Docker socket proxy — when set, overrides dockerSocket. */
  dockerHost: string | null;
  /**
   * Docker API version path segment, e.g. "/v1.44".
   * Empty string uses the versionless path (daemon serves current API).
   */
  dockerApiPrefix: string;
  collectionIntervalMs: number;
  containerFilter: { include: string[]; exclude: string[] };
  /** Log stream container filter — separate from metric collection filter. */
  logContainerFilter: { include: string[]; exclude: string[] };
  /** Max log lines per second per container (0 = unlimited). */
  logMaxLinesPerSec: number;
  /** Max entries in memory before backpressure (0 = unlimited). */
  logMaxBufferSize: number;
  /** Batch flush interval in milliseconds. */
  logBatchIntervalMs: number;
  /** Fraction of logs to keep (0.0-1.0). */
  logSampleRate: number;
  /** Max concurrent DB insert promises (0 = unlimited). */
  logMaxConcurrentInserts: number;
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildDockerApiPrefix(version: string | undefined): string {
  if (!version) return "";
  return `/v${version.replace(/^v/, "")}`;
}

const DEFAULT_MONITORING_CONFIG: MonitoringConfig = {
  dockerSocket: config.DOCKER_SOCKET,
  dockerHost: config.DOCKER_HOST ?? null,
  dockerApiPrefix: buildDockerApiPrefix(config.DOCKER_API_VERSION),
  collectionIntervalMs: config.COLLECTION_INTERVAL_MS,
  containerFilter: {
    include: parseCsv(config.CONTAINER_INCLUDE),
    exclude: parseCsv(config.CONTAINER_EXCLUDE),
  },
  logContainerFilter: {
    include: parseCsv(config.LOG_INCLUDE_CONTAINERS),
    exclude: parseCsv(config.LOG_EXCLUDE_CONTAINERS),
  },
  logMaxLinesPerSec: config.LOG_MAX_LINES_PER_SEC,
  logMaxBufferSize: config.LOG_MAX_BUFFER_SIZE,
  logBatchIntervalMs: config.LOG_BATCH_INTERVAL_MS,
  logSampleRate: config.LOG_SAMPLE_RATE,
  logMaxConcurrentInserts: config.LOG_MAX_CONCURRENT_INSERTS,
};

let monitoringCached: MonitoringConfig | null = null;

export function getMonitoringConfig(): MonitoringConfig {
  if (!monitoringCached) {
    monitoringCached = { ...DEFAULT_MONITORING_CONFIG };
  }
  return monitoringCached;
}

export function resetMonitoringConfig(): void {
  monitoringCached = null;
}

/**
 * Clamp out-of-range log tunables back to their defaults and warn.
 * Mirrors the runtime checks that used to live in `monitoring/config.ts`.
 */
export function validateMonitoringConfig(): void {
  const m = getMonitoringConfig();
  if (m.logSampleRate < 0 || m.logSampleRate > 1) {
    process.stderr.write("Invalid LOG_SAMPLE_RATE, must be between 0 and 1. Using default 1.0\n");
    m.logSampleRate = 1.0;
  }
  if (m.logMaxLinesPerSec < 0) {
    process.stderr.write("Invalid LOG_MAX_LINES_PER_SEC, must be >= 0. Using default 1000\n");
    m.logMaxLinesPerSec = 1000;
  }
  if (m.logMaxBufferSize < 0) {
    process.stderr.write("Invalid LOG_MAX_BUFFER_SIZE, must be >= 0. Using default 10000\n");
    m.logMaxBufferSize = 10_000;
  }
  if (m.logBatchIntervalMs < 0) {
    process.stderr.write("Invalid LOG_BATCH_INTERVAL_MS, must be >= 0. Using default 500\n");
    m.logBatchIntervalMs = 500;
  }
  if (m.logMaxConcurrentInserts < 0) {
    process.stderr.write("Invalid LOG_MAX_CONCURRENT_INSERTS, must be >= 0. Using default 3\n");
    m.logMaxConcurrentInserts = 3;
  }
}
