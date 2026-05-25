/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:8001",
      "/ws": { target: "ws://localhost:8001", ws: true },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    workspace: [
      {
        extends: true,
        test: {
          include: ["src/lib/components/**/*.test.ts"],
          environment: "jsdom",
        },
      },
    ],
    globals: true,
  },
});
