/**
 * Tests for src/lib/config.ts — the centralised Zod-validated configuration.
 *
 * Validates the operator contract:
 *   1. The schema parses a complete `.env.example`-shaped env without errors.
 *   2. Defaults are applied for every documented default (`PORT`, `REDIS_URL`,
 *      `RETENTION_DAYS`, log tunables, etc.).
 *   3. Coercion works (`PORT=8001` → number 8001, `LOG_SAMPLE_RATE=1.0` → 1).
 *   4. Malformed values (bad enum, invalid URL, etc.) throw at module load.
 *   5. `summarizeConfig()` correctly partitions env vars into set / defaulted /
 *      missing buckets.
 *   6. `formatConfigSummary()` produces a human-readable one-liner.
 *
 * Since `config` is frozen at module load, each scenario uses `vi.resetModules()`
 * + dynamic `import()` so a fresh parse runs against the env we just shaped.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Minimal happy-path env that matches the schema's defaults + the common
 *  required-feeling vars. Used when we don't care about defaults. */
function applyBaseEnv(): void {
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "info";
  process.env.PORT = "8001";
  process.env.REDIS_URL = "redis://localhost:6379";
  process.env.OBSERVE_URL = "http://localhost:8001";
  process.env.DOCKER_SOCKET = "/var/run/docker.sock";
  process.env.COLLECTION_INTERVAL_MS = "30000";
  process.env.LOG_LEVEL = "info";
}

function clearAllConfigVars(): void {
  // Only the keys the schema actually declares; we don't want to nuke CI env.
  const keys = [
    "NODE_ENV",
    "PORT",
    "DATABASE_URL",
    "REDIS_URL",
    "HIAI_OBSERVE_API_KEY",
    "ADMIN_API_KEY",
    "OBSERVE_URL",
    "ENCRYPTION_KEY",
    "CORS_ORIGIN",
    "EMBED_ALLOWED_ORIGINS",
    "DOCKER_SOCKET",
    "DOCKER_HOST",
    "DOCKER_API_VERSION",
    "COLLECTION_INTERVAL_MS",
    "CONTAINER_INCLUDE",
    "CONTAINER_EXCLUDE",
    "LOG_INCLUDE_CONTAINERS",
    "LOG_EXCLUDE_CONTAINERS",
    "LOG_MAX_LINES_PER_SEC",
    "LOG_MAX_BUFFER_SIZE",
    "LOG_BATCH_INTERVAL_MS",
    "LOG_SAMPLE_RATE",
    "LOG_MAX_CONCURRENT_INSERTS",
    "HIAI_DISABLE_LOG_WORKER",
    "TRUST_PROXY",
    "RETENTION_DAYS",
    "HEALTH_PING_URL",
    "STATUS_PAGE_CSS",
    "LOG_LEVEL",
    "MODEL_PRICING",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
    "DISCORD_WEBHOOK_URL",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
    "SLACK_WEBHOOK_URL",
    "WEBHOOK_URL",
    "WEBHOOK_SECRET",
    "PAGERDUTY_ROUTING_KEY",
    "TEAMS_WEBHOOK_URL",
    "NTFY_TOPIC",
    "NTFY_SERVER",
    "GOTIFY_SERVER",
    "GOTIFY_TOKEN",
    "PUSHOVER_USER_KEY",
    "PUSHOVER_TOKEN",
  ];
  for (const k of keys) delete process.env[k];
}

beforeEach(() => {
  clearAllConfigVars();
  vi.resetModules();
});

afterEach(() => {
  clearAllConfigVars();
  vi.restoreAllMocks();
});

describe("ConfigSchema — happy path", () => {
  it("parses a complete environment without throwing", async () => {
    applyBaseEnv();
    process.env.HIAI_OBSERVE_API_KEY = "ho_testkey1234567890abcdef";
    process.env.CORS_ORIGIN = "http://localhost:5174";

    const { config } = await import("../../src/lib/config.js");

    expect(config.NODE_ENV).toBe("test");
    expect(config.PORT).toBe(8001);
    expect(config.HIAI_OBSERVE_API_KEY).toBe("ho_testkey1234567890abcdef");
    expect(config.CORS_ORIGIN).toBe("http://localhost:5174");
  });

  it("applies documented defaults when env is absent", async () => {
    applyBaseEnv();

    const { config } = await import("../../src/lib/config.js");

    expect(config.PORT).toBe(8001);
    expect(config.REDIS_URL).toBe("redis://localhost:6379");
    expect(config.OBSERVE_URL).toBe("http://localhost:8001");
    expect(config.DOCKER_SOCKET).toBe("/var/run/docker.sock");
    expect(config.COLLECTION_INTERVAL_MS).toBe(30_000);
    expect(config.RETENTION_DAYS).toBe(30);
    expect(config.LOG_MAX_LINES_PER_SEC).toBe(1000);
    expect(config.LOG_MAX_BUFFER_SIZE).toBe(10_000);
    expect(config.LOG_BATCH_INTERVAL_MS).toBe(500);
    expect(config.LOG_SAMPLE_RATE).toBe(1.0);
    expect(config.LOG_MAX_CONCURRENT_INSERTS).toBe(3);
    expect(config.NODE_ENV).toBe("test");
    expect(config.LOG_LEVEL).toBe("info");
  });

  it("coerces numeric env strings to numbers", async () => {
    applyBaseEnv();
    process.env.PORT = "9000";
    process.env.COLLECTION_INTERVAL_MS = "5000";
    process.env.LOG_SAMPLE_RATE = "0.25";

    const { config } = await import("../../src/lib/config.js");

    expect(config.PORT).toBe(9000);
    expect(typeof config.PORT).toBe("number");
    expect(config.COLLECTION_INTERVAL_MS).toBe(5000);
    expect(config.LOG_SAMPLE_RATE).toBe(0.25);
  });

  it("accepts all three NODE_ENV enum values", async () => {
    for (const env of ["development", "production", "test"] as const) {
      clearAllConfigVars();
      vi.resetModules();
      applyBaseEnv();
      process.env.NODE_ENV = env;

      const { config } = await import("../../src/lib/config.js");
      expect(config.NODE_ENV).toBe(env);
    }
  });

  it("freezes the exported config object (immutability contract)", async () => {
    applyBaseEnv();

    const { config } = await import("../../src/lib/config.js");

    expect(Object.isFrozen(config)).toBe(true);
    expect(() => {
      // @ts-expect-error — intentionally mutating a frozen object to assert runtime behavior
      config.PORT = 1234;
    }).toThrow();
  });
});

describe("ConfigSchema — failure modes", () => {
  it("throws on invalid NODE_ENV at module load", async () => {
    applyBaseEnv();
    process.env.NODE_ENV = "staging"; // not in the enum

    await expect(import("../../src/lib/config.js")).rejects.toThrow(/NODE_ENV/);
  });

  it("throws on invalid REDIS_URL at module load", async () => {
    applyBaseEnv();
    process.env.REDIS_URL = "not-a-url";

    await expect(import("../../src/lib/config.js")).rejects.toThrow(/REDIS_URL/);
  });

  it("throws on invalid PORT at module load", async () => {
    applyBaseEnv();
    process.env.PORT = "not-a-number";

    await expect(import("../../src/lib/config.js")).rejects.toThrow(/PORT/);
  });

  it("throws on invalid LOG_LEVEL at module load", async () => {
    applyBaseEnv();
    process.env.LOG_LEVEL = "verbose"; // not in the enum

    await expect(import("../../src/lib/config.js")).rejects.toThrow(/LOG_LEVEL/);
  });

  it("surfaces the offending field path in the error message", async () => {
    applyBaseEnv();
    process.env.PORT = "abc";

    await expect(import("../../src/lib/config.js")).rejects.toThrow(/PORT: /);
  });
});

describe("summarizeConfig", () => {
  it("partitions env vars into set / defaulted / missing", async () => {
    // Minimal env — only set NODE_ENV + PORT so the schema parses. Leave the
    // remaining defaults to fall through to their schema defaults so we can
    // assert the defaulted bucket.
    process.env.NODE_ENV = "test";
    process.env.LOG_LEVEL = "info";
    process.env.PORT = "8001";
    process.env.HIAI_OBSERVE_API_KEY = "ho_abc123def456ghi789jkl012mno345";

    const { summarizeConfig } = await import("../../src/lib/config.js");
    const summary = summarizeConfig();

    // Set
    expect(summary.set).toContain("NODE_ENV");
    expect(summary.set).toContain("PORT");
    expect(summary.set).toContain("HIAI_OBSERVE_API_KEY");

    // Defaulted (not in env, but schema provides a value)
    expect(summary.defaulted).toContain("REDIS_URL");
    expect(summary.defaulted).toContain("OBSERVE_URL");
    expect(summary.defaulted).toContain("DOCKER_SOCKET");
    expect(summary.defaulted).toContain("RETENTION_DAYS");

    // Missing optional (not in env, schema is .optional())
    expect(summary.missing).toContain("DATABASE_URL");
    expect(summary.missing).toContain("ADMIN_API_KEY");
    expect(summary.missing).toContain("TELEGRAM_BOT_TOKEN");

    // Partition is exhaustive
    const total = summary.set.length + summary.defaulted.length + summary.missing.length;
    expect(total).toBe(summary.fields.length);
  });

  it("treats empty string as 'set' (not defaulted)", async () => {
    applyBaseEnv();
    process.env.HIAI_OBSERVE_API_KEY = ""; // explicitly empty

    const { summarizeConfig } = await import("../../src/lib/config.js");
    const summary = summarizeConfig();

    expect(summary.set).toContain("HIAI_OBSERVE_API_KEY");
    expect(summary.defaulted).not.toContain("HIAI_OBSERVE_API_KEY");
  });

  it("returns per-field records sorted by key", async () => {
    applyBaseEnv();

    const { summarizeConfig } = await import("../../src/lib/config.js");
    const summary = summarizeConfig();

    const keys = summary.fields.map((f) => f.key);
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
  });

  it("reports the post-coerce value for coerced fields", async () => {
    applyBaseEnv();
    process.env.PORT = "12345";

    const { summarizeConfig } = await import("../../src/lib/config.js");
    const summary = summarizeConfig();
    const port = summary.fields.find((f) => f.key === "PORT");
    expect(port?.value).toBe(12345);
    expect(typeof port?.value).toBe("number");
  });
});

describe("formatConfigSummary", () => {
  it("renders a human-readable one-liner with counts", async () => {
    const { formatConfigSummary } = await import("../../src/lib/config.js");
    const line = formatConfigSummary({
      set: ["A", "B"],
      defaulted: ["C"],
      missing: ["D", "E", "F"],
      fields: [],
    });

    expect(line).toContain("2 set");
    expect(line).toContain("1 defaulted");
    expect(line).toContain("3 missing");
    expect(line).toContain("6 total");
  });
});
