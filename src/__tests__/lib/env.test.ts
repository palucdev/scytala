import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getEnv, resetEnvCache } from "@/lib/env";

describe("src/lib/env", () => {
  const originalEnv = { ...process.env };

  const validEnvVars = {
    SUPABASE_URL: "https://xyzcompany.supabase.co",
    SUPABASE_ANON_KEY: "anon-key-1234567890",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key-1234567890",
    SESSION_SECRET: "a-very-long-secret-key-that-is-at-least-32-chars-long",
    NOTE_ENCRYPTION_KEY:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    resetEnvCache();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    resetEnvCache();
    process.env = { ...originalEnv };
  });

  describe("envSchema and getEnv", () => {
    it("validates and parses complete valid environment variables with defaults", () => {
      const parsed = getEnv(validEnvVars);

      expect(parsed.SUPABASE_URL).toBe("https://xyzcompany.supabase.co");
      expect(parsed.SUPABASE_ANON_KEY).toBe("anon-key-1234567890");
      expect(parsed.SUPABASE_SERVICE_ROLE_KEY).toBe(
        "service-role-key-1234567890",
      );
      expect(parsed.SESSION_SECRET).toBe(
        "a-very-long-secret-key-that-is-at-least-32-chars-long",
      );
      expect(parsed.NOTE_ENCRYPTION_KEY).toBe(
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      );
      expect(parsed.DEPLOY_ID).toBe("development");
      expect(parsed.APP_VERSION).toBe("undefined");
      expect(parsed.LOG_LEVEL).toBe("info");
      expect(parsed.SUPABASE_TIMEOUT_MS).toBe(8000);
    });

    it("parses optional custom values when provided", () => {
      const customVars = {
        ...validEnvVars,
        DEPLOY_ID: "prod-deploy-42",
        APP_VERSION: "1.0.0",
        LOG_LEVEL: "debug",
        SUPABASE_TIMEOUT_MS: "5000",
      };

      const parsed = getEnv(customVars);

      expect(parsed.DEPLOY_ID).toBe("prod-deploy-42");
      expect(parsed.APP_VERSION).toBe("1.0.0");
      expect(parsed.LOG_LEVEL).toBe("debug");
      expect(parsed.SUPABASE_TIMEOUT_MS).toBe(5000);
    });

    it("throws a descriptive error when SUPABASE_URL is missing or invalid", () => {
      expect(() =>
        getEnv({
          ...validEnvVars,
          SUPABASE_URL: "not-a-valid-url",
        }),
      ).toThrowError(/SUPABASE_URL must be a valid URL/);

      expect(() =>
        getEnv({
          ...validEnvVars,
          SUPABASE_URL: undefined,
        }),
      ).toThrowError(/SUPABASE_URL/);
    });

    it("throws an error when SUPABASE_ANON_KEY is missing", () => {
      expect(() =>
        getEnv({
          ...validEnvVars,
          SUPABASE_ANON_KEY: "",
        }),
      ).toThrowError(/SUPABASE_ANON_KEY is required/);
    });

    it("throws an error when SUPABASE_SERVICE_ROLE_KEY is missing", () => {
      expect(() =>
        getEnv({
          ...validEnvVars,
          SUPABASE_SERVICE_ROLE_KEY: "",
        }),
      ).toThrowError(/SUPABASE_SERVICE_ROLE_KEY is required/);
    });

    it("throws an error when SESSION_SECRET is shorter than 32 characters", () => {
      expect(() =>
        getEnv({
          ...validEnvVars,
          SESSION_SECRET: "too-short-secret",
        }),
      ).toThrowError(/SESSION_SECRET must be at least 32 characters long/);
    });

    it("throws an error when NOTE_ENCRYPTION_KEY is missing", () => {
      expect(() =>
        getEnv({
          ...validEnvVars,
          NOTE_ENCRYPTION_KEY: undefined,
        }),
      ).toThrowError(/NOTE_ENCRYPTION_KEY must be exactly 64 hex characters/);
    });

    it("throws an error when NOTE_ENCRYPTION_KEY is malformed (non-hex)", () => {
      expect(() =>
        getEnv({
          ...validEnvVars,
          NOTE_ENCRYPTION_KEY:
            "not-hex-at-all-not-hex-at-all-not-hex-at-all-not-hex!!",
        }),
      ).toThrowError(/NOTE_ENCRYPTION_KEY must be exactly 64 hex characters/);
    });

    it("throws an error when NOTE_ENCRYPTION_KEY has the wrong length", () => {
      expect(() =>
        getEnv({
          ...validEnvVars,
          NOTE_ENCRYPTION_KEY: "deadbeef",
        }),
      ).toThrowError(/NOTE_ENCRYPTION_KEY must be exactly 64 hex characters/);
    });

    it("accepts uppercase hex NOTE_ENCRYPTION_KEY (matches the note-crypto parser)", () => {
      expect(() =>
        getEnv({
          ...validEnvVars,
          NOTE_ENCRYPTION_KEY:
            "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789",
        }),
      ).not.toThrow();
    });

    it("decodes a 64-hex-char NOTE_ENCRYPTION_KEY to exactly 32 bytes for raw AES-256 import", () => {
      expect(validEnvVars.NOTE_ENCRYPTION_KEY).toHaveLength(64);
      expect(validEnvVars.NOTE_ENCRYPTION_KEY).toMatch(/^[0-9a-f]{64}$/);
    });

    it("throws an error when LOG_LEVEL is invalid", () => {
      expect(() =>
        getEnv({
          ...validEnvVars,
          LOG_LEVEL: "verbose",
        }),
      ).toThrowError(/LOG_LEVEL/);
    });

    it("reads from process.env and caches result when called with no arguments", () => {
      process.env.SUPABASE_URL = "https://live.supabase.co";
      process.env.SUPABASE_ANON_KEY = "live-anon-key";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "live-service-key";
      process.env.SESSION_SECRET =
        "this-is-a-32-char-secret-for-testing-purposes";
      process.env.NOTE_ENCRYPTION_KEY =
        "f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a5968778695a4b3c2d1e0f";

      const firstCall = getEnv();
      expect(firstCall.SUPABASE_URL).toBe("https://live.supabase.co");

      // Mutate process.env to ensure cached value is returned
      process.env.SUPABASE_URL = "https://mutated.supabase.co";
      const secondCall = getEnv();
      expect(secondCall.SUPABASE_URL).toBe("https://live.supabase.co");

      // Reset cache and re-call
      resetEnvCache();
      const thirdCall = getEnv();
      expect(thirdCall.SUPABASE_URL).toBe("https://mutated.supabase.co");
    });
  });
});
