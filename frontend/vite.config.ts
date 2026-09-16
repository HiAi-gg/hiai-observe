/// <reference types="vitest/config" />

import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

// Staff API keys stay on the server. Never bake HIAI_OBSERVE_API_KEY (or any
// other secret) into client modules — the apiKey store is localStorage-backed
// via the settings page. Empty string is the public sentinel.
const hiaiApiKey = "";

/**
 * SvelteKit's pipeline runs Svelte's own compiler for `.svelte.ts` files,
 * which bypasses Vite's `define` substitution. The transform replaces
 * `__HIAI_OBSERVE_API_KEY__` with the empty sentinel after Svelte compiles.
 * The plugin only touches modules that reference the placeholder.
 */
function hiaiDefinePlugin(apiKey: string): Plugin {
  const placeholder = "__HIAI_OBSERVE_API_KEY__";
  const replacement = JSON.stringify(apiKey);
  return {
    name: "hiai-observe-api-key-define",
    enforce: "post",
    transform(code) {
      if (!code.includes(placeholder)) return null;
      return {
        code: code.replaceAll(placeholder, replacement),
        map: null,
      };
    },
  };
}

const LAN_UI_BASE = "/hiai-observe";
const BASE = (process.env.PUBLIC_BASE_PATH ?? LAN_UI_BASE).replace(/\/$/, "");

export default defineConfig({
  plugins: [tailwindcss(), sveltekit(), hiaiDefinePlugin(hiaiApiKey)],
  define: {
    __HIAI_OBSERVE_API_KEY__: JSON.stringify(hiaiApiKey),
  },
  server: {
    host: "0.0.0.0",
    port: 5197,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      ...(BASE
        ? {
            [`${BASE}/api`]: {
              target: "http://127.0.0.1:8001",
              changeOrigin: true,
              rewrite: (path) => path.replace(BASE, "") || "/",
            },
            [`${BASE}/ws`]: {
              target: "ws://127.0.0.1:8001",
              ws: true,
              rewrite: (path) => path.replace(BASE, "") || "/",
            },
          }
        : {}),
      "/api": "http://127.0.0.1:8001",
      "/ws": { target: "ws://127.0.0.1:8001", ws: true },
    },
  },
  // Vite tries to pre-bundle deps via esbuild, but esbuild has no
  // `.svelte` loader — the svelte plugin handles `.svelte` files in the
  // main pipeline, not in the optimizeDeps step. Pre-bundling these
  // packages produces `No loader is configured for ".svelte" files`
  // errors. Excluding them routes them through the normal Svelte plugin
  // pipeline where they compile correctly.
  optimizeDeps: {
    exclude: [
      "lucide-svelte",
      "svelte-tiptap",
      "@hiai-gg/hiai-ui",
      // bits-ui ships .svelte files; esbuild has no .svelte loader, so it
      // must be processed by the Svelte plugin in the main pipeline.
      "bits-ui",
    ],
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    globals: true,
  },
});
