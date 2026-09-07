import { describe, expect, it } from "vitest";
import { isStaffUiPath } from "../../src/lib/staff-ui-gate.js";

describe("isStaffUiPath", () => {
  it.each(["/", "/issues", "/releases", "/settings", "/logs"])("gates staff page %s", (path) => {
    expect(isStaffUiPath(path)).toBe(true);
  });

  it.each([
    "/login",
    "/login/",
    "/api/health",
    "/api/auth/get-session",
    "/api/dashboard",
    "/status",
    "/status/acme",
    "/embed/dashboard",
    "/v1/traces",
    "/health",
    "/_app/immutable/entry.js",
    "/favicon.ico",
  ])("skips %s", (path) => {
    expect(isStaffUiPath(path)).toBe(false);
  });
});
