/**
 * Request ID Middleware
 *
 * Generates a UUID for each request, sets X-Request-ID response header,
 * and makes the request ID available via Elysia derive.
 * Reuses incoming X-Request-ID if present.
 */

import { Elysia } from "elysia";
import { randomUUID } from "crypto";

export const requestIdPlugin = new Elysia({ name: "request-id" })
  .derive({ as: "global" }, ({ request }) => {
    const requestId = request.headers.get("x-request-id") || randomUUID();
    return { requestId };
  })
  .onAfterHandle({ as: "global" }, ({ requestId, set }) => {
    (set.headers as Record<string, string>)["x-request-id"] = requestId;
  });
