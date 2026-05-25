import { promises as dns } from "node:dns";

export interface CheckResult {
  status: "up" | "down";
  responseTimeMs: number;
  details?: Record<string, unknown>;
  error?: string;
}

interface DnsCheckConfig {
  host: string;
  recordType: string;
  expectedValue?: string;
  resolver?: string;
}

export async function runDnsCheck(config: DnsCheckConfig): Promise<CheckResult> {
  const start = Date.now();

  try {
    const resolver = new dns.Resolver();
    if (config.resolver) {
      resolver.setServers([config.resolver]);
    }

    const recordType = config.recordType.toUpperCase();
    let records: string[] = [];

    switch (recordType) {
      case "A": {
        const addrs = await resolver.resolve4(config.host);
        records = addrs;
        break;
      }
      case "AAAA": {
        const addrs = await resolver.resolve6(config.host);
        records = addrs;
        break;
      }
      case "CNAME": {
        const addrs = await resolver.resolveCname(config.host);
        records = addrs;
        break;
      }
      case "MX": {
        const mxRecords = await resolver.resolveMx(config.host);
        records = mxRecords.map((mx) => `${mx.priority} ${mx.exchange}`);
        break;
      }
      case "TXT": {
        const txtRecords = await resolver.resolveTxt(config.host);
        records = txtRecords.map((parts) => parts.join(""));
        break;
      }
      case "NS": {
        const nsRecords = await resolver.resolveNs(config.host);
        records = nsRecords;
        break;
      }
      default:
        return {
          status: "down",
          responseTimeMs: Date.now() - start,
          error: `Unsupported DNS record type: ${recordType}`,
        };
    }

    const responseTimeMs = Date.now() - start;

    if (records.length === 0) {
      return {
        status: "down",
        responseTimeMs,
        error: `No ${recordType} records found for ${config.host}`,
        details: { records: [], recordType },
      };
    }

    // Validate expected value if provided
    if (config.expectedValue) {
      const matches = records.some(
        (r) => r.toLowerCase() === config.expectedValue!.toLowerCase()
      );
      if (!matches) {
        return {
          status: "down",
          responseTimeMs,
          error: `Expected value "${config.expectedValue}" not found in ${recordType} records`,
          details: { records, recordType, expectedValue: config.expectedValue },
        };
      }
    }

    return {
      status: "up",
      responseTimeMs,
      details: { records, recordType },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "DNS lookup failed";
    return {
      status: "down",
      responseTimeMs: Date.now() - start,
      error: message,
    };
  }
}
