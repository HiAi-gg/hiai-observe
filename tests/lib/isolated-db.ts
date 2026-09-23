/**
 * Live Postgres tests may run only against a disposable fixture.
 *
 * Shared workstation data is `app_hiai_observe` (role `app_hiai_observe`).
 * The historical default `observe@localhost/hiai_observe` is the GitHub
 * Actions service DSN — allowed only when GITHUB_ACTIONS=true. Local runs
 * use `observe_test` / `hiai_observe_test`.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

function parsePostgresUrl(url: string | undefined): URL | null {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function isIsolatedObserveFixture(url: string | undefined): boolean {
  const parsed = parsePostgresUrl(url);
  if (!parsed) return false;
  if (!LOCAL_HOSTS.has(parsed.hostname)) return false;

  const dbName = parsed.pathname.replace(/^\//, "");
  const user = decodeURIComponent(parsed.username);

  if (dbName === "app_hiai_observe") return false;

  if (process.env.GITHUB_ACTIONS === "true") {
    return user === "observe" && dbName === "hiai_observe";
  }

  return user === "observe_test" && dbName === "hiai_observe_test";
}

export function liveTenantFixture(): boolean {
  return (
    process.env.TENANT_SCOPE_LIVE_DB === "1" && isIsolatedObserveFixture(process.env.DATABASE_URL)
  );
}

/** INTEGRATION suites also require an isolated DSN (or GitHub Actions). */
export function liveIntegrationFixture(): boolean {
  return process.env.INTEGRATION === "1" && isIsolatedObserveFixture(process.env.DATABASE_URL);
}
