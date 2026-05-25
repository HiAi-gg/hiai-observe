/**
 * Standardized error response helpers for API handlers.
 *
 * All error responses use the shape { error: string; detail?: string }.
 * In production, detail is omitted from internal errors.
 */

const isProd = process.env.NODE_ENV === "production";

export function badRequest(message: string, detail?: string) {
  return { error: message, detail };
}

export function unauthorized(message = "Unauthorized") {
  return { error: message };
}

export function forbidden(message = "Forbidden") {
  return { error: message };
}

export function notFound(message = "Not found") {
  return { error: message };
}

export function internal(message = "Internal error") {
  return { error: message, detail: isProd ? undefined : message };
}
