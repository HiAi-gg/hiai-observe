/**
 * Runtime health gate for the staff UI on :5197 /hiai-observe.
 *
 * Does not start Vite (strictPort). Probe an already-listening dev server
 * or the URL CI boots. Never prints secret values.
 *
 *   VITE_HEALTH_URL=http://127.0.0.1:5197/hiai-observe/ bun scripts/vite-health-gate.ts
 */

const DEFAULT_URL = "http://127.0.0.1:5197/hiai-observe/";
const KEY_LEAK = /\bho_[A-Za-z0-9_]{8,}/;
const ENV_LEAK = /HIAI_OBSERVE_API_KEY/;

function fail(message: string): never {
  console.error(`vite-health-gate: ${message}`);
  process.exit(1);
}

function collectAssetUrls(html: string, origin: string): string[] {
  const urls = new Set<string>();
  const patterns = [/import\("([^"]+)"\)/g, /\bsrc="([^"]+)"/g, /\bhref="([^"]+\.js[^"]*)"/g];
  for (const re of patterns) {
    for (const match of html.matchAll(re)) {
      const raw = match[1];
      if (!raw || raw.startsWith("data:")) continue;
      try {
        urls.add(new URL(raw, origin).href);
      } catch {
        // ignore malformed
      }
    }
  }
  return [...urls].slice(0, 8);
}

async function main() {
  const url = process.env.VITE_HEALTH_URL ?? DEFAULT_URL;
  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow" });
  } catch (err) {
    fail(`fetch failed for ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (res.status !== 200) {
    fail(`expected HTTP 200 from ${url}, got ${res.status}`);
  }

  const html = await res.text();
  const failures: string[] = [];

  if (!html.includes("theme-observe")) failures.push("missing theme-observe class");
  if (!html.includes("HiAi Observe")) failures.push("missing HiAi Observe title");
  if (!html.includes("/hiai-observe")) failures.push("missing /hiai-observe base path");
  if (!html.includes('"PUBLIC_BASE_PATH":"/hiai-observe"')) {
    failures.push("missing PUBLIC_BASE_PATH=/hiai-observe in SvelteKit env");
  }
  if (ENV_LEAK.test(html)) failures.push("HTML contains HIAI_OBSERVE_API_KEY");
  if (KEY_LEAK.test(html)) failures.push("HTML contains ho_ key material");
  if (/DATABASE_URL|REDIS_URL|SMTP_PASS/.test(html)) {
    failures.push("HTML contains backend secret env names with values");
  }

  const origin = new URL(url).origin;
  for (const asset of collectAssetUrls(html, url)) {
    if (!asset.startsWith(origin)) continue;
    let assetRes: Response;
    try {
      assetRes = await fetch(asset, { redirect: "follow" });
    } catch {
      continue;
    }
    if (!assetRes.ok) continue;
    const body = await assetRes.text();
    if (ENV_LEAK.test(body)) failures.push(`asset leaked HIAI_OBSERVE_API_KEY: ${asset}`);
    if (KEY_LEAK.test(body)) failures.push(`asset leaked ho_ key: ${asset}`);
  }

  if (failures.length > 0) {
    fail(failures.join("; "));
  }

  console.log(`vite-health-gate: ok ${url} status=${res.status} bytes=${html.length}`);
}

await main();
