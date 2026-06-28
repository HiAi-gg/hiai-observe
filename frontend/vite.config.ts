/// <reference types="vitest/config" />

import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

// Read API key from the project root .env at config load time.
// This is the same env value the backend (`HIAI_OBSERVE_API_KEY`) uses,
// so the frontend can pre-fill the apiKey store from build-time config.
const hiaiApiKey = process.env.HIAI_OBSERVE_API_KEY || "";

/**
 * SvelteKit's pipeline runs Svelte's own compiler for `.svelte.ts` files,
 * which bypasses Vite's `define` substitution. We add a `transform` hook
 * that runs after Svelte's compile and substitutes `__HIAI_OBSERVE_API_KEY__`
 * with the build-time value. The plugin only touches the modules that
 * reference the placeholder, so it's safe to register globally.
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

export default defineConfig({
  plugins: [tailwindcss(), sveltekit(), hiaiDefinePlugin(hiaiApiKey)],
  define: {
    __HIAI_OBSERVE_API_KEY__: JSON.stringify(hiaiApiKey),
  },
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:8001",
      "/ws": { target: "ws://localhost:8001", ws: true },
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
