/**
 * Zero-dependency, edge-compatible structured JSON logger for Scytala.
 * Provides recursive sanitization of credentials, PBKDF2 hashes, JWT tokens,
 * and circular object graphs, outputting single-line JSON formatted for Cloudflare Workers Logs.
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "sessiontoken",
  "secret",
  "sessionsecret",
  "authorization",
  "cookie",
  "setcookie",
  "key",
  "apikey",
  "servicerolekey",
  "credentials",
  "jwt",
]);

const SENSITIVE_SUBSTRINGS = [
  "password",
  "secret",
  "cookie",
  "token",
  "credential",
];

const SENSITIVE_PATTERNS = [
  /^bearer\s+[a-zA-Z0-9_\-.]+/i,
  /^\$pbkdf2\$\d+\$[a-f0-9]+\$[a-f0-9]+/i,
  /^eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/,
];

function sanitizeString(str: string): string {
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(str)) return "[REDACTED]";
  }
  return str;
}

export function sanitizeValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return sanitizeString(value);
  }
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: typeof value.message === "string" ? sanitizeString(value.message) : value.message,
      stack: typeof value.stack === "string" ? sanitizeString(value.stack) : value.stack,
      cause: value.cause ? sanitizeValue(value.cause, seen) : undefined,
    };
  }

  if (typeof value === "object") {
    if (seen.has(value as object)) return "[CIRCULAR]";
    seen.add(value as object);

    if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item, seen));
    }

    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      const normalizedKey = lowerKey.replace(/[^a-z0-9]/g, "");
      const isSensitive =
        SENSITIVE_KEYS.has(normalizedKey) ||
        SENSITIVE_SUBSTRINGS.some((substr) => lowerKey.includes(substr));

      if (isSensitive) {
        sanitizedObj[key] = "[REDACTED]";
      } else {
        sanitizedObj[key] = sanitizeValue(val, seen);
      }
    }
    return sanitizedObj;
  }

  return String(value);
}

export class Logger {
  private readonly context: Record<string, unknown>;
  private readonly minLevel: LogLevel;

  constructor(context: Record<string, unknown> = {}, minLevel?: LogLevel) {
    this.context = context;
    const envLevel = (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) || "info";
    this.minLevel =
      minLevel || (process.env.NODE_ENV === "development" ? "debug" : envLevel);
  }

  child(additionalContext: Record<string, unknown>): Logger {
    return new Logger({ ...this.context, ...additionalContext }, this.minLevel);
  }

  private shouldLog(level: LogLevel): boolean {
    const minSeverity = LOG_LEVEL_SEVERITY[this.minLevel] ?? LOG_LEVEL_SEVERITY.info;
    const currentSeverity = LOG_LEVEL_SEVERITY[level] ?? LOG_LEVEL_SEVERITY.info;
    return currentSeverity >= minSeverity;
  }

  private emit(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>,
    error?: unknown,
  ): void {
    if (!this.shouldLog(level)) return;

    const mergedContext = { ...this.context, ...meta };
    const sanitizedContext =
      Object.keys(mergedContext).length > 0
        ? (sanitizeValue(mergedContext) as Record<string, unknown>)
        : undefined;
    const sanitizedError = error ? sanitizeValue(error) : undefined;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: "scytala",
      environment: process.env.NODE_ENV || "development",
      version: process.env.APP_VERSION || "0.1.5",
      ...(sanitizedContext !== undefined ? { context: sanitizedContext } : {}),
      ...(sanitizedError !== undefined ? { error: sanitizedError } : {}),
    };

    if (process.env.NODE_ENV === "development") {
      const color =
        level === "error" || level === "fatal"
          ? "\x1b[31m"
          : level === "warn"
            ? "\x1b[33m"
            : "\x1b[36m";
      console.log(
        `${color}[${entry.timestamp}] [${level.toUpperCase()}]\x1b[0m ${message}`,
        {
          ...(entry.context && { context: entry.context }),
          ...(entry.error && { error: entry.error }),
        },
      );
    } else {
      const json = JSON.stringify(entry);
      if (level === "error" || level === "fatal") {
        console.error(json);
      } else if (level === "warn") {
        console.warn(json);
      } else {
        console.log(json);
      }
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.emit("debug", message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.emit("info", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>, error?: unknown): void {
    this.emit("warn", message, meta, error);
  }

  error(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    this.emit("error", message, meta, error);
  }

  fatal(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    this.emit("fatal", message, meta, error);
  }
}

export const logger = new Logger();
