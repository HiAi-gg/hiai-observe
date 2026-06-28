/**
 * TLS Certificate Check
 *
 * Connects to a host via TLS and extracts the peer certificate
 * to determine validity period and days until expiry.
 */

import { connect } from "node:tls";

export interface CertInfo {
  validTo: Date;
  validFrom: Date;
  issuer: string;
  daysRemaining: number;
}

/**
 * Check the TLS certificate for a given host and port.
 * Uses `tls.connect()` with `rejectUnauthorized: false` to inspect
 * certificates even if they are expired or self-signed.
 */
export async function checkCert(host: string, port: number = 443): Promise<CertInfo> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const safeResolve = (value: CertInfo) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const safeReject = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    const socket = connect(
      {
        host,
        port,
        rejectUnauthorized: false,
        servername: host,
      },
      () => {
        try {
          const cert = socket.getPeerCertificate();

          if (!cert?.valid_from || !cert.valid_to) {
            socket.destroy();
            safeReject(new Error("No certificate returned from server"));
            return;
          }

          const validFrom = new Date(cert.valid_from);
          const validTo = new Date(cert.valid_to);
          const now = new Date();
          const daysRemaining = Math.floor(
            (validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
          );

          // Build issuer string from issuer object
          const issuerParts: string[] = [];
          if (cert.issuer) {
            if (cert.issuer.CN) issuerParts.push(`CN=${cert.issuer.CN}`);
            if (cert.issuer.O) issuerParts.push(`O=${cert.issuer.O}`);
          }
          const issuer = issuerParts.join(", ") || "Unknown";

          socket.destroy();
          safeResolve({ validTo, validFrom, issuer, daysRemaining });
        } catch (err) {
          socket.destroy();
          safeReject(err instanceof Error ? err : new Error(String(err)));
        }
      },
    );

    socket.on("error", (err: Error) => {
      socket.destroy();
      safeReject(new Error(`TLS connection failed: ${err.message}`));
    });

    // Timeout after 10 seconds
    socket.setTimeout(10_000, () => {
      socket.destroy();
      safeReject(new Error("TLS connection timed out"));
    });
  });
}
