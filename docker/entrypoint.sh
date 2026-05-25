#!/bin/sh
set -e

echo "Running migrations..."
bunx drizzle-kit migrate

echo "Partitioning tables..."
bun run scripts/partition-tables.ts || echo "Partitioning skipped (pg_partman may not be installed)"

echo "Starting application..."
exec "$@"
