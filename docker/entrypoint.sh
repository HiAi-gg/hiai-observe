#!/bin/sh
set -e

echo "Running migrations..."
bun run scripts/migrate.ts

echo "Partitioning tables..."
bun run scripts/partition-tables.ts || echo "Partitioning skipped (pg_partman may not be installed)"

echo "Starting application..."
exec "$@"
