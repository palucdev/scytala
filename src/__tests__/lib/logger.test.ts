import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger, sanitizeValue } from "@/lib/logger";

describe("src/lib/logger", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("sanitizeValue", () => {
    it("preserves primitives (null, undefined, numbers, booleans, normal strings)", () => {
      expect(sanitizeValue(null)).toBeNull();
      expect(sanitizeValue(undefined)).toBeUndefined();
      expect(sanitizeValue(42)).toBe(42);
      expect(sanitizeValue(true)).toBe(true);
      expect(sanitizeValue("hello world")).toBe("hello world");
    });

    it("redacts sensitive keys in object properties (case-insensitive and normalized)", () => {
      const input = {
        user_alias: "alice",
        password: "superSecretPassword123!",
        password_hash: "$pbkdf2$100000$salt$hash",
        sessionToken: "some-session-token",
        session_secret: "raw-session-secret-value",
        sessionSecret: "camel-session-secret-value",
        "set-cookie": "cookie-header-value",
        setCookie: "cookie-value",
        SECRET: "top-secret-key",
        authorization: "Bearer secret-token",
        apiKey: "supabase-key",
        userCredential: "sensitive-credential",
        nested: {
          userPassword: "nested-password",
          safeField: "safe value",
        },
      };

      const sanitized = sanitizeValue(input) as Record<string, unknown>;
      expect(sanitized.user_alias).toBe("alice");
      expect(sanitized.password).toBe("[REDACTED]");
      expect(sanitized.password_hash).toBe("[REDACTED]");
      expect(sanitized.sessionToken).toBe("[REDACTED]");
      expect(sanitized.session_secret).toBe("[REDACTED]");
      expect(sanitized.sessionSecret).toBe("[REDACTED]");
      expect(sanitized["set-cookie"]).toBe("[REDACTED]");
      expect(sanitized.setCookie).toBe("[REDACTED]");
      expect(sanitized.SECRET).toBe("[REDACTED]");
      expect(sanitized.authorization).toBe("[REDACTED]");
      expect(sanitized.apiKey).toBe("[REDACTED]");
      expect(sanitized.userCredential).toBe("[REDACTED]");
      expect((sanitized.nested as Record<string, unknown>).userPassword).toBe("[REDACTED]");
      expect((sanitized.nested as Record<string, unknown>).safeField).toBe("safe value");
    });

    it("redacts sensitive pattern values in strings", () => {
      expect(sanitizeValue("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz")).toBe("[REDACTED]");
      expect(
        sanitizeValue("$pbkdf2$100000$00000000000000000000000000000000$00000000000000000000000000000000"),
      ).toBe("[REDACTED]");
      expect(
        sanitizeValue("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgN7"),
      ).toBe("[REDACTED]");
    });

    it("sanitizes arrays recursively", () => {
      const input = ["safe", "Bearer sensitive-token", { password: "secret" }];
      const sanitized = sanitizeValue(input) as unknown[];

      expect(sanitized[0]).toBe("safe");
      expect(sanitized[1]).toBe("[REDACTED]");
      expect((sanitized[2] as Record<string, string>).password).toBe("[REDACTED]");
    });

    it("handles circular references without throwing", () => {
      const circularObj: Record<string, unknown> = { name: "test" };
      circularObj.self = circularObj;

      const sanitized = sanitizeValue(circularObj) as Record<string, unknown>;
      expect(sanitized.name).toBe("test");
      expect(sanitized.self).toBe("[CIRCULAR]");
    });

    it("sanitizes Error objects including cause", () => {
      const cause = new Error("Bearer token-cause");
      const err = new Error("Something went wrong");
      err.cause = cause;

      const sanitized = sanitizeValue(err) as Record<string, unknown>;
      expect(sanitized.name).toBe("Error");
      expect(sanitized.message).toBe("Something went wrong");
      expect(sanitized.stack).toBeDefined();
      expect((sanitized.cause as Record<string, unknown>).message).toBe("[REDACTED]");
    });
  });

  describe("Logger class", () => {
    it("emits formatted JSON in production mode", () => {
      process.env.NODE_ENV = "production";
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const testLogger = new Logger({}, "info");
      testLogger.info("User signed in", { userId: "user-123", password: "should-redact" });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const loggedJson = JSON.parse(consoleLogSpy.mock.calls[0][0]);

      expect(loggedJson.level).toBe("info");
      expect(loggedJson.message).toBe("User signed in");
      expect(loggedJson.service).toBe("scytala");
      expect(loggedJson.environment).toBe("production");
      expect(loggedJson.version).toBe("0.1.5");
      expect(loggedJson.context.userId).toBe("user-123");
      expect(loggedJson.context.password).toBe("[REDACTED]");
    });

    it("emits to console.error for error and fatal levels in production", () => {
      process.env.NODE_ENV = "production";
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const testLogger = new Logger({}, "info");
      const err = new Error("Database timeout");
      testLogger.error("Failed to fetch dashboard", err, { dashboardHash: "abc12345" });
      testLogger.fatal("System crash", err);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      const firstCall = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(firstCall.level).toBe("error");
      expect(firstCall.error.message).toBe("Database timeout");
      expect(firstCall.context.dashboardHash).toBe("abc12345");

      const secondCall = JSON.parse(consoleErrorSpy.mock.calls[1][0]);
      expect(secondCall.level).toBe("fatal");
    });

    it("emits to console.warn for warn level in production", () => {
      process.env.NODE_ENV = "production";
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const testLogger = new Logger({}, "info");
      testLogger.warn("Rate limit approaching", { remaining: 1 });

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleWarnSpy.mock.calls[0][0]);
      expect(logEntry.level).toBe("warn");
      expect(logEntry.message).toBe("Rate limit approaching");
    });

    it("respects log level severity filtering", () => {
      process.env.NODE_ENV = "production";
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const warnLogger = new Logger({}, "warn");
      warnLogger.debug("Debug msg");
      warnLogger.info("Info msg");
      warnLogger.warn("Warn msg");

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    });

    it("formats colored output in development mode", () => {
      process.env.NODE_ENV = "development";
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const devLogger = new Logger({}, "debug");
      devLogger.debug("Debug event", { topic: "testing" });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const callArgs = consoleLogSpy.mock.calls[0];
      expect(callArgs[0]).toContain("[DEBUG]");
      expect(callArgs[0]).toContain("Debug event");
      expect(callArgs[1].context).toEqual({ topic: "testing" });
    });

    it("creates child loggers with merged context", () => {
      process.env.NODE_ENV = "production";
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const rootLogger = new Logger({ app: "scytala" }, "info");
      const childLogger = rootLogger.child({ module: "auth", action: "login" });

      childLogger.info("Login attempt", { userAlias: "alice" });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.context).toEqual({
        app: "scytala",
        module: "auth",
        action: "login",
        userAlias: "alice",
      });
    });
  });
});
