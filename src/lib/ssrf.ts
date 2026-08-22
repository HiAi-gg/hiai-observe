/**
 * Block outbound checks/webhooks from targeting internal networks.
 * Resolves DNS and denies loopback, link-local, RFC1918, IPv6 ULA, and
 * cloud metadata endpoints.
 */

import { resolve4, resolve6 } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal", "docker-socket-proxy"]);

function ipv4Octets(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

export function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const o = ipv4Octets(ip);
    if (!o) return true;
    const a = o[0] ?? 0;
    const b = o[1] ?? 0;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (v === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (normalized.startsWith("fe80")) return true;
    if (normalized.startsWith("::ffff:")) {
      const mapped = normalized.slice("::ffff:".length);
      return isBlockedIp(mapped);
    }
    // AWS IMDS IPv6
    if (normalized === "fd00:ec2::254") return true;
    return false;
  }
  return true;
}

export async function resolveHostIps(hostname: string): Promise<string[]> {
  if (isIP(hostname)) return [hostname];
  const [v4, v6] = await Promise.allSettled([resolve4(hostname), resolve6(hostname)]);
  const ips: string[] = [];
  if (v4.status === "fulfilled") ips.push(...v4.value);
  if (v6.status === "fulfilled") ips.push(...v6.value);
  return ips;
}

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

export async function assertSafeHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfError("URL scheme must be http or https");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost")) {
    throw new SsrfError("URL target is not allowed");
  }
  const ips = await resolveHostIps(host);
  if (ips.length === 0) {
    throw new SsrfError("URL host could not be resolved");
  }
  if (ips.some(isBlockedIp)) {
    throw new SsrfError("URL target is not allowed");
  }
  return url;
}

export async function assertSafeTcpTarget(host: string, port: number): Promise<void> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new SsrfError("Invalid TCP port");
  }
  const hostname = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost")) {
    throw new SsrfError("TCP target is not allowed");
  }
  const ips = await resolveHostIps(hostname);
  if (ips.length === 0) {
    throw new SsrfError("TCP host could not be resolved");
  }
  if (ips.some(isBlockedIp)) {
    throw new SsrfError("TCP target is not allowed");
  }
}
