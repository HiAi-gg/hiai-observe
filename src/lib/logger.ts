/**
 * Structured Logger
 *
 * JSON-lines output in production, human-readable with colors in development.
 * Configurable via LOG_LEVEL env var (debug, info, warn, error).
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[90m",   // gray
  info:  "\x1b[36m",   // cyan
  warn:  "\x1b[33m",   // yellow
  error: "\x1b[31m",   // red
};

const RESET = "\x1b[0m";

const configuredLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";
const isDev = process.env.NODE_ENV !== "production";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[configuredLevel];
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

interface LogContext {
  [key: string]: unknown;
}

function write(level: LogLevel, msg: string, ctx?: LogContext): void {
  if (!shouldLog(level)) return;

  if (isDev) {
    const color = LEVEL_COLORS[level];
    const ts = formatTimestamp();
    const prefix = `${color}${level.toUpperCase().padEnd(5)}${RESET}`;
    const contextStr = ctx ? ` ${JSON.stringify(ctx)}` : "";
    const line = `${prefix} ${ts} ${msg}${contextStr}`;
    if (level === "error") {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  } else {
    const record: Record<string, unknown> = {
      timestamp: formatTimestamp(),
      level,
      msg,
    };
    if (ctx) {
      for (const [key, value] of Object.entries(ctx)) {
        record[key] = value;
      }
    }
    const line = JSON.stringify(record);
    if (level === "error") {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }
}

export const logger = {
  debug(msg: string, ctx?: LogContext): void {
    write("debug", msg, ctx);
  },
  info(msg: string, ctx?: LogContext): void {
    write("info", msg, ctx);
  },
  warn(msg: string, ctx?: LogContext): void {
    write("warn", msg, ctx);
  },
  error(msg: string, ctx?: LogContext): void {
    write("error", msg, ctx);
  },
};
