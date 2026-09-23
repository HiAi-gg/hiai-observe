import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: [
      "**/packages/**",
      "**/node_modules/**",
      // e2e/integration load a live server + DB. Default unit runs skip them
      // entirely so store/db is never imported. CI E2E sets INTEGRATION=1.
      ...(process.env.INTEGRATION === "1" ? [] : ["tests/e2e/**", "tests/integration/**"]),
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/**/index.ts"],
      thresholds: {
        lines: 25,
        branches: 20,
        functions: 20,
      },
    },
  },
});
