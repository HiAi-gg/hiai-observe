# Security Policy

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or any other public channel.**

Report privately by emailing **security@hiai-gg.dev**. Include as much of the following as you can:

- A clear description of the issue and its impact
- Steps to reproduce, or a proof-of-concept
- Affected version(s) (commit SHA, tag, or release)
- Affected deployment configuration (self-hosted version, Docker image, etc.)
- Your assessment of severity and CVSS score, if known

You should expect an acknowledgment within **72 hours**. We will follow up with a triage outcome and a coordinated disclosure timeline. We are happy to credit reporters in the release notes unless you prefer to remain anonymous.

Please practice responsible disclosure: give us a reasonable window to investigate and patch before publishing details.

## Supported Versions

HiAi Observe is pre-1.0 (currently `0.1.x`). Security fixes are backported only to the latest minor release line. Older versions receive no patches.

| Version | Supported          | Notes                                     |
|---------|--------------------|-------------------------------------------|
| `0.1.x` | ✅ Active          | Current development line; gets all fixes  |
| `< 0.1` | ❌ End of life     | Upgrade to the latest `0.1.x` release     |
| `main`  | ⚠️ Best-effort     | The next minor; may receive fixes before a tagged release |

**Recommendation:** Always run the latest `0.1.x` release. Watch the [GitHub Releases page](https://github.com/HiAi-gg/hiai-observe/releases) (or the `CHANGELOG.md`) for security-relevant updates and follow the standard Docker upgrade flow (`docker compose pull && docker compose up -d`).

## Scope

HiAi Observe is designed as a **self-hosted, single-container** observability platform. The security model is shaped by that deployment posture.

### In scope

- **The HiAi Observe server, workers, and bundled frontend** — anything in this repository under `src/`, `frontend/`, `packages/`, and the production `Dockerfile`.
- **Default runtime behavior** of the published container image, including:
  - API key authentication on sensitive routes
  - Bearer-token validation and project isolation
  - Rate limiting and request-size limits
  - PostgreSQL query layer and Drizzle ORM access patterns
  - Redis pub/sub, cache, and rate-limit usage
  - Ingestion parsers: Sentry-compatible envelopes, OTLP traces/metrics, Mastra trace payloads
  - Alert dispatcher and notification channels (Telegram, Discord, SMTP)
  - Uptime worker, Docker stats collector, host resource collector, log streamer
- **Configuration defaults** shipped in `docker-compose.yml`, `docker-compose.prod.yml`, and `.env.example`.
- **Published Docker images** under `ghcr.io/hiai-gg/hiai-observe` (or the org's equivalent registry).

### Out of scope

- Vulnerabilities in third-party dependencies **without** a reachable exploit in HiAi Observe. Please report these upstream, but include them in your report and we will help assess impact.
- Issues that require a misconfigured, network-exposed deployment without authentication (e.g. leaving the admin port publicly reachable with a weak or default API key).
- Self-inflicted issues from running the container as root, mounting sensitive host paths, or exposing `/var/run/docker.sock` to untrusted workloads. These are documented in `README.md` and are deployment choices, not product bugs.
- Social engineering, phishing, or denial-of-service attacks.
- Theoretical findings without a working proof of concept against the current supported version.

### Deployment-hardening expectations (your responsibility)

A self-hosted observability tool only stays secure if the operator hardens the host. We strongly recommend:

- **Bind the API port to `127.0.0.1`** and front it with a reverse proxy (Caddy, Nginx, Traefik) that terminates TLS.
- **Generate a strong API key** with `openssl rand -hex 24` (or `bun run gen-key`) — never reuse the default.
- **Keep the container image up to date**; subscribe to releases for CVE notifications.
- **Restrict `/var/run/docker.sock` access** to the HiAi Observe container only; treat the socket as equivalent to root on the host.
- **Network-isolate the PostgreSQL and Redis** containers; do not expose their ports to the public internet.
- **Enable host firewall rules** (e.g. `ufw`, `nftables`) so only the reverse proxy is reachable on 80/443.
- **Back up the database** regularly; observability data can contain sensitive payloads from your applications.

## Acknowledgments

We are grateful to the security community. Reporters who follow this policy will be credited in the release notes accompanying the fix (unless anonymity is requested).

## Further Reading

- [README.md](./README.md) — quick start, deployment, and configuration
- [CONTRIBUTING.md](./CONTRIBUTING.md) — development setup
- [CHANGELOG.md](./CHANGELOG.md) — release history and security notes
