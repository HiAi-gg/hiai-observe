/**
 * Isolation gate for live Postgres tests.
 *
 * Shared workstation data lives in app_hiai_observe (role app_hiai_observe).
 * Live inserts are allowed only on a disposable fixture:
 *   - GitHub Actions service: observe@localhost/hiai_observe when GITHUB_ACTIONS=true
 *   - Local: observe_test@localhost/hiai_observe_test
 */

import { afterEach, describe, expect, it } from "vitest";
import { isIsolatedObserveFixture, liveTenantFixture } from "./isolated-db.js";

const saved = {
  GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
  TENANT_SCOPE_LIVE_DB: process.env.TENANT_SCOPE_LIVE_DB,
  DATABASE_URL: process.env.DATABASE_URL,
  INTEGRATION: process.env.INTEGRATION,
};

afterEach(() => {
  restore("GITHUB_ACTIONS", saved.GITHUB_ACTIONS);
  restore("TENANT_SCOPE_LIVE_DB", saved.TENANT_SCOPE_LIVE_DB);
  restore("DATABASE_URL", saved.DATABASE_URL);
  restore("INTEGRATION", saved.INTEGRATION);
});

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe("isIsolatedObserveFixture", () => {
  it("rejects missing or unparseable URLs", () => {
    expect(isIsolatedObserveFixture(undefined)).toBe(false);
    expect(isIsolatedObserveFixture("")).toBe(false);
    expect(isIsolatedObserveFixture("not-a-url")).toBe(false);
  });

  it("rejects the shared workstation database app_hiai_observe", () => {
    delete process.env.GITHUB_ACTIONS;
    expect(
      isIsolatedObserveFixture("postgresql://app_hiai_observe:x@127.0.0.1:5432/app_hiai_observe"),
    ).toBe(false);
  });

  it("rejects observe@localhost/hiai_observe outside GitHub Actions", () => {
    delete process.env.GITHUB_ACTIONS;
    expect(
      isIsolatedObserveFixture("postgresql://observe:observe@localhost:5432/hiai_observe"),
    ).toBe(false);
  });

  it("accepts the GitHub Actions disposable service DSN", () => {
    process.env.GITHUB_ACTIONS = "true";
    expect(
      isIsolatedObserveFixture("postgresql://observe:observe@localhost:5432/hiai_observe"),
    ).toBe(true);
    expect(
      isIsolatedObserveFixture("postgresql://observe:observe@127.0.0.1:5432/hiai_observe"),
    ).toBe(true);
  });

  it("accepts the local disposable fixture observe_test / hiai_observe_test", () => {
    delete process.env.GITHUB_ACTIONS;
    expect(
      isIsolatedObserveFixture(
        "postgresql://observe_test:observe_test@127.0.0.1:5432/hiai_observe_test",
      ),
    ).toBe(true);
    expect(
      isIsolatedObserveFixture(
        "postgresql://observe_test:observe_test@localhost:5432/hiai_observe_test",
      ),
    ).toBe(true);
  });

  it("rejects a remote host even with a test database name", () => {
    expect(
      isIsolatedObserveFixture(
        "postgresql://observe_test:observe_test@10.0.0.8:5432/hiai_observe_test",
      ),
    ).toBe(false);
  });
});

describe("liveTenantFixture", () => {
  it("requires TENANT_SCOPE_LIVE_DB=1 plus an isolated URL", () => {
    delete process.env.GITHUB_ACTIONS;
    process.env.DATABASE_URL =
      "postgresql://observe_test:observe_test@127.0.0.1:5432/hiai_observe_test";
    delete process.env.TENANT_SCOPE_LIVE_DB;
    expect(liveTenantFixture()).toBe(false);

    process.env.TENANT_SCOPE_LIVE_DB = "1";
    expect(liveTenantFixture()).toBe(true);
  });

  it("does not treat the CI DSN as live locally even with the opt-in flag", () => {
    delete process.env.GITHUB_ACTIONS;
    process.env.TENANT_SCOPE_LIVE_DB = "1";
    process.env.DATABASE_URL = "postgresql://observe:observe@localhost:5432/hiai_observe";
    expect(liveTenantFixture()).toBe(false);
  });
});

describe("liveIntegrationFixture", () => {
  it("requires INTEGRATION=1 plus an isolated URL", async () => {
    const { liveIntegrationFixture } = await import("./isolated-db.js");
    delete process.env.GITHUB_ACTIONS;
    process.env.DATABASE_URL =
      "postgresql://observe_test:observe_test@127.0.0.1:5432/hiai_observe_test";
    delete process.env.INTEGRATION;
    expect(liveIntegrationFixture()).toBe(false);
    process.env.INTEGRATION = "1";
    expect(liveIntegrationFixture()).toBe(true);
  });
});
