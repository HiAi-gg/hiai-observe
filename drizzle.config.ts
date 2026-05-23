import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/store/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL
      ?? (process.env.NODE_ENV === "production"
        ? (() => { throw new Error("DATABASE_URL is required in production"); })()
        : "postgresql://observe:observe@localhost:5432/hiai_observe"),
  },
});
