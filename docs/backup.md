# Database Backup

## Quick Start

```bash
./scripts/backup.sh
```

Creates a compressed SQL dump at `backups/hiai_observe_YYYY-MM-DD_HH-MM.sql.gz`.

## What Gets Backed Up

- All 13 tables: `projects`, `issues`, `events`, `traces`, `uptime_monitors`, `uptime_checks`, `container_stats`, `host_stats`, `alerts`, `alert_history`, `logs`, `retention_config`, `sessions`
- Schema definitions, indexes, constraints, and sequences
- Alert rules and retention configuration

## What Does NOT Need Backup

**Redis** — all Redis data is ephemeral (cache, queues, pub/sub, rate-limit counters). It is rebuilt on restart. No backup needed.

## Restore

```bash
gunzip -c backups/hiai_observe_YYYY-MM-DD_HH-MM.sql.gz | psql "$DATABASE_URL"
```

Or with an explicit connection string:

```bash
gunzip -c backups/hiai_observe_YYYY-MM-DD_HH-MM.sql.gz \
  | psql postgresql://observe:observe@localhost:5432/hiai_observe
```

## Cron Setup

Run daily at 2:00 AM:

```cron
0 2 * * * /app/scripts/backup.sh
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://observe:observe@localhost:5432/hiai_observe` | Connection string |
| `BACKUP_DIR` | `./backups` (relative to script) | Where to store backups |
| `BACKUP_KEEP` | `7` | Number of backups to retain (older ones are deleted) |

## Manual Rotation Check

```bash
ls -lht backups/hiai_observe_*.sql.gz
```
