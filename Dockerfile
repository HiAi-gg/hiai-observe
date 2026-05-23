# ── Stage 1: Build frontend ────────────────────────────────────────────
FROM oven/bun:1-alpine AS frontend-build
WORKDIR /app
COPY frontend/package.json frontend/bun.lock* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install
COPY frontend/ ./
RUN bun run build

# ── Stage 2: Build backend ─────────────────────────────────────────────
FROM oven/bun:1-alpine AS backend-build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install
COPY src/ src/
COPY tsconfig.json ./
RUN bun build src/index.ts --outdir dist --target bun

# ── Stage 3: Runtime ───────────────────────────────────────────────────
FROM oven/bun:1-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache curl

# Copy built backend
COPY --from=backend-build /app/dist ./dist
COPY --from=backend-build /app/node_modules ./node_modules
COPY --from=backend-build /app/package.json ./

# Copy built frontend (served by Elysia static handler or Caddy)
COPY --from=frontend-build /app/build ./frontend/build

# Copy migrations
COPY drizzle/ ./drizzle/ 2>/dev/null || true

ENV NODE_ENV=production
ENV PORT=8001
EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8001/health || exit 1

CMD ["bun", "dist/index.js"]
