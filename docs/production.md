# HiAi Observe — Production Deployment Guide

This guide covers deploying HiAi Observe in production with proper security, TLS, and operational best practices.

## Prerequisites

- Docker 24+ and Docker Compose v2
- A domain name (for TLS) or internal network setup
- `openssl` for key generation

## 1. Generate Secrets

Generate strong random values for all sensitive configuration:

```bash
# API key (32 bytes hex — prefix with "ho_" for convention)
API_KEY="ho_$(openssl rand -hex 24)"
echo "Generated API key: $API_KEY"

# PostgreSQL password
DB_PASS="$(openssl rand -hex 24)"
echo "Generated DB password: $DB_PASS"

# Redis password
REDIS_PASS="$(openssl rand -hex 24)"
echo "Generated Redis password: $REDIS_PASS"

# Notification encryption key (32 bytes hex)
ENCRYPTION_KEY="$(openssl rand -hex 32)"
echo "Generated encryption key: $ENCRYPTION_KEY"
```

**Save these values securely.** They cannot be recovered.

## 2. Configure Environment

Create `.env` from the template and fill in production values:

```bash
cp .env.example .env
```

Required changes for production:

| Variable | Production Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Enables security warnings |
| `DATABASE_URL` | `postgresql://observe:${DB_PASS}@postgres:5432/hiai_observe` | Use internal DNS, not localhost |
| `REDIS_URL` | `redis://:${REDIS_PASS}@redis:6379` | Use internal DNS, not localhost |
| `HIAI_OBSERVE_API_KEY` | Your generated key | Bootstrap admin project |
| `ENCRYPTION_KEY` | Your generated key | Encrypts notification tokens at rest |
| `CORS_ORIGIN` | `https://your-domain.com` | Restrict to your frontend origin |

**Never commit `.env` to git.** Only `.env.example` is tracked.

## 3. Production Docker Compose

Use the production compose file which includes Caddy for TLS:

```bash
docker compose -f docker-compose.prod.yml up -d
```

This starts:
- **app** — HiAi Observe on port 8001 (internal only)
- **postgres** — PostgreSQL 18 with persistent volume
- **redis** — Redis 8 with persistent volume
- **caddy** — TLS termination + reverse proxy (ports 80/443)

### First-time setup

1. Set `DOMAIN` in `.env` or export it before starting:
   ```bash
   export DOMAIN=observe.yourdomain.com
   ```

2. Caddy auto-provisions a Let's Encrypt certificate on first request.

3. Verify health:
   ```bash
   curl -fsS https://observe.yourdomain.com/health
   ```

## 4. TLS and Reverse Proxy

### Caddy (included)

The production compose includes Caddy which automatically handles:
- TLS certificate provisioning (Let's Encrypt)
- TLS certificate renewal
- HTTP→HTTPS redirect
- Security headers (nosniff, DENY frame, strict referrer)

### Custom Reverse Proxy

If using nginx or another proxy instead of Caddy, ensure:

1. **WebSocket support** — the log viewer uses WebSocket (`/ws/logs`):
   ```nginx
   location /ws/ {
       proxy_pass http://app:8001;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_set_header Host $host;
       proxy_read_timeout 86400;
   }
   ```

2. **Security headers**:
   ```nginx
   add_header X-Content-Type-Options nosniff;
   add_header X-Frame-Options DENY;
   add_header Referrer-Policy strict-origin-when-cross-origin;
   ```

3. **Health check endpoint** — expose `/health` for uptime monitoring.

## 5. Docker Socket Security

HiAi Observe monitors Docker containers by reading the Docker socket. This is a **security-sensitive configuration**.

### Read-Only Socket (Recommended)

Mount the socket read-only to prevent container management from within HiAi Observe:

```yaml
# docker-compose.prod.yml — app service
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
```

### Docker Socket Proxy (Most Secure)

For maximum security, use a Docker socket proxy like [`tecnativa/docker-socket-proxy`](https://github.com/tecnativa/docker-socket-proxy):

```yaml
# Add to docker-compose.prod.yml
services:
  docker-proxy:
    image: tecnativa/docker-socket-proxy
    environment:
      CONTAINERS: 1
      INFO: 0
      EVENTS: 0
      EXEC: 0
      POST: 0
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - observe

  app:
    environment:
      DOCKER_SOCKET: tcp://docker-proxy:2375
    depends_on:
      - docker-proxy
```

This grants HiAi Observe **read-only access** to container metadata without exposing the full Docker socket.

### What HiAi Observe Uses the Socket For

- Listing running containers (`docker ps`)
- Reading container stats (`docker stats` — non-blocking snapshot)
- Streaming container logs (`docker logs --follow`)

All operations are read-only. HiAi Observe never creates, stops, or modifies containers.

## 6. Database Security

### Change Default Passwords

The default PostgreSQL password (`observe`) is insecure. Change it:

```bash
# Connect to PostgreSQL
docker compose -f docker-compose.prod.yml exec postgres psql -U observe -d hiai_observe

# Change password
ALTER USER observe WITH PASSWORD 'your-new-secure-password';
```

Update `DATABASE_URL` in `.env` to match.

### Redis Authentication

Set a Redis password in `docker-compose.prod.yml`:

```yaml
redis:
  command: redis-server --requirepass ${REDIS_PASS}
```

Update `REDIS_URL` in `.env` to include the password:
```
REDIS_URL=redis://:${REDIS_PASS}@redis:6379
```

### Backups

```bash
# PostgreSQL
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U observe hiai_observe > backup-$(date +%Y%m%d).sql

# Restore
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U observe hiai_observe < backup-20260607.sql
```

Automated backup guidance: see [docs/backup.md](backup.md).

## 7. Network Security

### Don't Expose Ports Directly

The production compose binds the app to `8001` internally. Only Caddy should be publicly accessible on ports 80/443.

### Internal-Only Services

PostgreSQL and Redis should **never** be exposed to the public internet. They run on the internal `observe` Docker network.

### Firewall Rules

If running on a VPS, restrict inbound traffic:

```bash
# Allow only HTTPS
ufw allow 443/tcp
ufw allow 80/tcp   # For HTTP→HTTPS redirect
ufw deny 8001/tcp  # Block direct app access
```

## 8. Monitoring HiAi Observe Itself

HiAi Observe exposes its own metrics:

```bash
# Health check
curl -fsS https://observe.yourdomain.com/health

# Prometheus metrics
curl -fsS https://observe.yourdomain.com/metrics
```

For self-monitoring, configure an external uptime check (e.g., cron job, Uptime Kuma, or Healthchecks.io) to ping `/health` every 60 seconds.

Set `HEALTH_PING_URL` in `.env` to enable external health pings.

## 9. Resource Limits

The production compose sets memory limits:

| Service | Limit | Reservation |
|---|---|---|
| app | 512MB | 128MB |
| postgres | 256MB | — |
| redis | 256MB | — |
| caddy | — | — |

Adjust based on your traffic. For high-volume ingestion, increase the app limit to 1GB.

### Log Streaming Limits (Critical for Small VPS)

If your VPS has <512MB RAM or you run many containers, add these aggressive limits to `.env`:

```bash
# Per-container: max 100 lines/sec (default 1000)
LOG_MAX_LINES_PER_SEC=100
# Keep only 10% of logs (default 100%)
LOG_SAMPLE_RATE=0.1
# Small buffer before backpressure (default 10000)
LOG_MAX_BUFFER_SIZE=1000
# Flush every 2 seconds instead of 500ms
LOG_BATCH_INTERVAL_MS=2000
# Only 1 concurrent DB insert (default 3)
LOG_MAX_CONCURRENT_INSERTS=1
# Exclude noisy containers entirely
LOG_EXCLUDE_CONTAINERS=postgres,redis,mongo,outline
```

These settings reduce log worker memory usage by ~500x compared to defaults. The rate limiter and backpressure prevent runaway memory growth even during log storms.

## 10. Updating

```bash
# Pull latest image
docker compose -f docker-compose.prod.yml pull

# Restart with zero-downtime (Caddy handles the transition)
docker compose -f docker-compose.prod.yml up -d

# Verify
curl -fsS https://observe.yourdomain.com/health
```

## Security Checklist

- [ ] Strong API key generated (`openssl rand -hex 24`)
- [ ] PostgreSQL password changed from default
- [ ] Redis password set
- [ ] `DATABASE_URL` and `REDIS_URL` use internal DNS (not `localhost`)
- [ ] TLS configured via Caddy or reverse proxy
- [ ] Docker socket mounted read-only or via socket proxy
- [ ] `.env` is gitignored and never committed
- [ ] Ports 8001, 5432, 6379 not exposed publicly
- [ ] `ENCRYPTION_KEY` set for notification token encryption
- [ ] `CORS_ORIGIN` restricted to your domain

## Troubleshooting

### Startup Warnings

If you see warnings about missing `REDIS_URL`, `HIAI_OBSERVE_API_KEY`, or weak keys, check your `.env` configuration. Warnings only appear when `NODE_ENV=production`.

### TLS Certificate Errors

- Ensure `DOMAIN` is set and DNS points to your server
- Check Caddy logs: `docker compose -f docker-compose.prod.yml logs caddy`
- Caddy needs port 80 open for ACME challenge

### Connection Refused

- Verify PostgreSQL and Redis are healthy: `docker compose -f docker-compose.prod.yml ps`
- Check internal DNS resolution from the app container
- Ensure `DATABASE_URL` uses service names (`postgres`, `redis`) not `localhost`
