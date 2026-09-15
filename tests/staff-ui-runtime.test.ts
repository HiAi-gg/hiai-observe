/**
 * Runtime staff-UI health gate.
 *
 * Default `bun run test` only checks that the probe script exists.
 * Live Vite on :5197 /hiai-observe requires VITE_HEALTH_GATE=1 (CI
 * vite-health job starts Vite, then runs scripts/vite-health-gate.ts).
 */

import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const live = process.env.VITE_HEALTH_GATE === "1";
const URL = process.env.VITE_HEALTH_URL ?? "http://127.0.0.1:5197/hiai-observe/";

describe("staff UI runtime health gate", () => {
  it("ships the Vite health-gate probe script", () => {
    expect(existsSync("scripts/vite-health-gate.ts")).toBe(true);
  });

  describe.skipIf(!live)("live Vite :5197 /hiai-observe", () => {
    it("returns 200 HTML with LAN base and empty-key sentinel", async () => {
      const res = await fetch(URL, { redirect: "follow" });
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("theme-observe");
      expect(html).toContain("/hiai-observe");
      expect(html).toContain("HiAi Observe");
      expect(html).toContain('"PUBLIC_BASE_PATH":"/hiai-observe"');
      expect(html).not.toMatch(/HIAI_OBSERVE_API_KEY/);
      expect(html).not.toMatch(/\bho_[A-Za-z0-9_]{8,}/);
    });
  });
});
