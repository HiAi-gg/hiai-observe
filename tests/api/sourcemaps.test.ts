import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/store/db.js", () => ({ db: {} }));

const { sourcemapsRoutes } = await import("../../src/api/sourcemaps.js");

describe("GET /api/sourcemaps/:projectId/:release", () => {
  it("returns 404 when the map is missing", async () => {
    const res = await sourcemapsRoutes.handle(
      new Request("http://localhost/api/sourcemaps/660e8400-e29b-41d4-a716-446655440001/1.0.0"),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });
});
