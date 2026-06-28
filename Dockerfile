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
# Workspace manifests are needed so bun can resolve the workspace graph
COPY packages/ ./packages/
RUN HUSKY=0 bun install --frozen-lockfile 2>/dev/null || HUSKY=0 bun install
COPY src/ src/
COPY tsconfig.json ./
RUN bun build src/index.ts --outdir dist --target bun

# ── Stage 3: Production deps only ─────────────────────────────────────
FROM oven/bun:1-alpine AS deps-production
WORKDIR /app
COPY package.json bun.lock* ./
# Workspace manifests are needed so bun can resolve the workspace graph
COPY packages/ ./packages/
RUN HUSKY=0 bun install --production --frozen-lockfile 2>/dev/null || HUSKY=0 bun install --production

# ── Stage 4: Runtime ──────────────────────────────────────────────────
FROM oven/bun:1-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache curl

# Copy production dependencies only (no devDependencies)
COPY --from=deps-production /app/node_modules ./node_modules

# Copy built backend
COPY --from=backend-build /app/dist ./dist
COPY --from=backend-build /app/package.json ./

# Copy built frontend (served by Caddy or reverse proxy)
COPY --from=frontend-build /app/build ./frontend/build

# Copy migrations
COPY drizzle/ ./drizzle/

# Copy scripts
COPY scripts/ ./scripts/

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production
ENV PORT=8001
EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8001/health || exit 1

USER bun

ENTRYPOINT ["/entrypoint.sh"]
CMD ["bun", "dist/index.js"]
