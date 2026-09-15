import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: "build",
      assets: "build",
      fallback: "index.html",
      precompress: false,
      strict: false,
    }),
    paths: {
      // Unset NODE_ENV (GitHub Actions `vite dev`) is not "development".
      // Treat anything except production as the LAN staff base.
      base:
        process.env.PUBLIC_BASE_PATH ??
        (process.env.NODE_ENV === "production" ? "" : "/hiai-observe"),
    },
  },
};

export default config;
