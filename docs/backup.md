# Backup

Use `scripts/backup.sh` to dump PostgreSQL.

Typical:

```bash
DATABASE_URL=postgresql://observe:observe@localhost:5432/hiai_observe ./scripts/backup.sh
```

Restore with `psql` against a matching major version (PostgreSQL 18). Redis is cache/pubsub — do not treat it as durable telemetry storage.

Sourcemaps written under `./sourcemaps` (or `/app/data/sourcemaps` in a volume) are not in Postgres; back them up separately if you rely on them.
