import { checkCert } from "./cert-check.js";

export interface HttpCheckConfig {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "HEAD" | "PATCH" | "OPTIONS";
  headers?: Record<string, string>;
  body?: string;
  authType?: "basic" | "bearer";
  authValue?: string;
  maxRedirects?: number;
  keyword?: string;
  keywordNot?: string;
  timeoutMs?: number;
}

export interface HttpCheckResult {
  statusCode: number | null;
  responseTimeMs: number;
  error: string | null;
  success: boolean;
  certExpiry: Date | null;
}

export async function runHttpCheck(
  url: string,
  config: HttpCheckConfig = {}
): Promise<HttpCheckResult> {
  const start = Date.now();
  const timeoutMs = config.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let certExpiry: Date | null = null;

  try {
    const headers: Record<string, string> = { ...(config.headers ?? {}) };
    if (config?.authType === "basic" && config?.authValue) {
      headers.Authorization = `Basic ${config.authValue}`;
    } else if (config?.authType === "bearer" && config?.authValue) {
      headers.Authorization = `Bearer ${config.authValue}`;
    }

    const fetchOpts: RequestInit = {
      method: config?.method ?? "GET",
      headers,
      signal: controller.signal,
      redirect: config?.maxRedirects === 0 ? "manual" : "follow",
    };
    if (config?.body && fetchOpts.method !== "GET" && fetchOpts.method !== "HEAD") {
      fetchOpts.body = config.body;
    }

    const res = await fetch(url, fetchOpts);
    const responseTimeMs = Date.now() - start;
    clearTimeout(timeout);

    if (url.startsWith("https://")) {
      try {
        const urlObj = new URL(url);
        const certInfo = await checkCert(urlObj.hostname, Number(urlObj.port) || 443);
        certExpiry = certInfo.validTo;
      } catch (_certErr) {
        certExpiry = null;
      }
    }

    let keywordError: string | null = null;
    if (config?.keyword || config?.keywordNot) {
      try {
        const body = await res.clone().text();
        if (config.keyword && !body.includes(config.keyword)) {
          keywordError = `Keyword "${config.keyword}" not found in response body`;
        }
        if (config.keywordNot && body.includes(config.keywordNot)) {
          keywordError = `Excluded keyword "${config.keywordNot}" found in response body`;
        }
      } catch (_bodyErr) {
        keywordError = null;
      }
    }

    const success = res.status >= 200 && res.status < 400 && keywordError === null;
    return { statusCode: res.status, responseTimeMs, error: keywordError, success, certExpiry };
  } catch (err: unknown) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : "Unknown error";
    return { statusCode: null, responseTimeMs: Date.now() - start, error: message, success: false, certExpiry };
  }
}
