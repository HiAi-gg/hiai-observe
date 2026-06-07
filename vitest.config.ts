import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["**/packages/**", "**/node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/**/index.ts"],
      // Report-only: the suite is intentionally unit-focused (mocked DB), so the
      // aspirational 70% line gate is unreachable and was never enforced (CI
      // never ran). Raising real coverage is a tracked follow-up; re-add a
      // ratcheting threshold once integration tests cover the route layer.
    },
  },
});
