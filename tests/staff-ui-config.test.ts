/**
 * HIAI-OBSERVE-T01: staff UI is served under /hiai-observe on port 5197.
 * These assertions read the Vite/SvelteKit config source (the runtime
 * contract). They do not start the Vite process.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("staff UI subpath and port", () => {
  it("vite.dev server binds 5197 with /hiai-observe LAN base", () => {
    const src = readFileSync("frontend/vite.config.ts", "utf8");
    expect(src).toMatch(/const LAN_UI_BASE = "\/hiai-observe"/);
    expect(src).toMatch(/port:\s*5197/);
    expect(src).toMatch(/strictPort:\s*true/);
    expect(src).toMatch(/PUBLIC_BASE_PATH/);
  });

  it("sveltekit paths.base uses PUBLIC_BASE_PATH or /hiai-observe in development", () => {
    const src = readFileSync("frontend/svelte.config.js", "utf8");
    expect(src).toMatch(/PUBLIC_BASE_PATH/);
    expect(src).toMatch(/"\/hiai-observe"/);
  });

  it("vite API proxy strips the staff base before forwarding to :8001", () => {
    const src = readFileSync("frontend/vite.config.ts", "utf8");
    expect(src).toContain("http://127.0.0.1:8001");
    expect(src).toMatch(/\$\{BASE\}\/api/);
  });

  it("does not bake a staff API key; empty string is the public sentinel", () => {
    const src = readFileSync("frontend/vite.config.ts", "utf8");
    expect(src).toMatch(/const hiaiApiKey = ""/);
    expect(src).not.toMatch(/process\.env\.HIAI_OBSERVE_API_KEY/);
    expect(src).not.toMatch(/HIAI_OBSERVE_API_KEY \|\| "ho_/);
  });

  it("stores module does not hard-code a staff key fallback", () => {
    const src = readFileSync("frontend/src/lib/stores.svelte.ts", "utf8");
    expect(src).toContain("__HIAI_OBSERVE_API_KEY__");
    expect(src).not.toMatch(/ho_[A-Za-z0-9_]+/);
    expect(src).not.toMatch(/process\.env\.HIAI_OBSERVE_API_KEY/);
  });

  it("CI Test job opts into live tenant DB tests on the disposable service", () => {
    const src = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(src).toMatch(/TENANT_SCOPE_LIVE_DB:\s*"1"/);
    expect(src).toContain("tests/middleware/tenant-scope.test.ts");
    expect(src).toContain("Live tenant-scope DB tests");
  });

  it("CI starts a Vite health gate for :5197 /hiai-observe", () => {
    const src = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(src).toMatch(/vite-health:/);
    expect(src).toContain("scripts/vite-health-gate.ts");
    expect(src).toContain("/hiai-observe/");
    expect(src).toMatch(/port 5197/);
  });

  it("Docker Hub workflow does not push from pull_request", () => {
    const src = readFileSync(".github/workflows/docker.yml", "utf8");
    expect(src).toContain(
      "push: ${{ env.HAS_DOCKERHUB == 'true' && github.event_name == 'workflow_run' }}",
    );
    expect(src).not.toMatch(/on:\s*\n\s*push:/);
  });
});
