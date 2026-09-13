import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  encryptNoteField,
  decryptNoteField,
  isEncryptedEnvelope,
} from "@/lib/note-crypto";
import { getEnv, resetEnvCache } from "@/lib/env";

describe("src/lib/note-crypto", () => {
  const originalEnv = { ...process.env };

  const TEST_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const NOTE_A = "11111111-1111-4111-8111-111111111111";
  const NOTE_B = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      SUPABASE_URL: "https://xyzcompany.supabase.co",
      SUPABASE_ANON_KEY: "anon-key-1234567890",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key-1234567890",
      SESSION_SECRET: "a-very-long-secret-key-that-is-at-least-32-chars-long",
      NOTE_ENCRYPTION_KEY: TEST_KEY,
    };
    resetEnvCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetEnvCache();
  });

  describe("isEncryptedEnvelope", () => {
    it("returns true for v1 envelope prefixes", () => {
      expect(isEncryptedEnvelope("v1:AAAA:BBBB")).toBe(true);
    });

    it("returns false for legacy plaintext, v0 passthrough, and empty strings", () => {
      expect(isEncryptedEnvelope("hello world")).toBe(false);
      expect(isEncryptedEnvelope("v0:v1:something")).toBe(false);
      expect(isEncryptedEnvelope("")).toBe(false);
    });
  });

  describe("encryptNoteField", () => {
    it("returns an empty string unchanged for empty input", async () => {
      expect(await encryptNoteField("", NOTE_A)).toBe("");
    });

    it("escapes plaintext starting with v1: as a v0 passthrough marker", async () => {
      const plaintext = "v1: this looks like an envelope";
      const stored = await encryptNoteField(plaintext, NOTE_A);
      expect(stored).toBe(`v0:${plaintext}`);
      expect(isEncryptedEnvelope(stored)).toBe(false);
    });

    it("produces a v1 envelope with base64 IV and ciphertext segments", async () => {
      const stored = await encryptNoteField("secret title", NOTE_A);
      expect(isEncryptedEnvelope(stored)).toBe(true);

      const parts = stored.split(":");
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe("v1");
      expect(parts[1]).toHaveLength(24); // 128-bit IV -> 16 bytes -> 24 base64 chars
      const ivBytes = Buffer.from(parts[1], "base64");
      const ctBytes = Buffer.from(parts[2], "base64");
      expect(ivBytes).toHaveLength(16);
      // 12-char plaintext -> 12 bytes ciphertext + 16 bytes GCM tag
      expect(ctBytes).toHaveLength(12 + 16);
    });

    it("is non-deterministic: two encryptions of the same plaintext produce different envelopes (fresh IV)", async () => {
      const a = await encryptNoteField("same text", NOTE_A);
      const b = await encryptNoteField("same text", NOTE_A);
      expect(a).not.toBe(b);
    });
  });

  describe("decryptNoteField", () => {
    it("round-trips plaintext to plaintext", async () => {
      const plaintext = "My Note Title — with émojis 🎉 and 中文";
      const stored = await encryptNoteField(plaintext, NOTE_A);
      expect(await decryptNoteField(stored, NOTE_A)).toBe(plaintext);
    });

    it("round-trips a v1-prefixed plaintext title back to the original", async () => {
      const plaintext = "v1:not actually encrypted";
      const stored = await encryptNoteField(plaintext, NOTE_A);
      expect(stored).toBe(`v0:${plaintext}`);
      expect(await decryptNoteField(stored, NOTE_A)).toBe(plaintext);
    });

    it("passes through legacy plaintext unchanged", async () => {
      expect(await decryptNoteField("old plaintext row", NOTE_A)).toBe(
        "old plaintext row",
      );
      expect(await decryptNoteField("", NOTE_A)).toBe("");
    });

    it("rejects a tampered envelope (GCM tag failure)", async () => {
      const stored = await encryptNoteField("tamper me", NOTE_A);
      const [, iv, ct] = stored.split(":");
      const tampered = `v1:${iv}:${ct}`;
      // Flip a ciphertext byte by re-encoding a corrupted byte string.
      const ctBytes = Buffer.from(ct, "base64");
      ctBytes[0] ^= 0xff;
      const flipped = `v1:${iv}:${(
        ctBytes.toString("base64") as string
      )}`;

      await expect(
        decryptNoteField(flipped, NOTE_A),
      ).rejects.toThrowError(/Decryption failed/);
      expect(flipped).not.toBe(tampered);
    });

    it("rejects decryption with a different noteId (AAD binding)", async () => {
      const stored = await encryptNoteField("bound to note A", NOTE_A);
      await expect(decryptNoteField(stored, NOTE_B)).rejects.toThrowError(
        /Decryption failed/,
      );
    });

    it("rejects decryption with the wrong key", async () => {
      const stored = await encryptNoteField("wrong key", NOTE_A);

      process.env.NOTE_ENCRYPTION_KEY =
        "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
      resetEnvCache();

      // Re-import a fresh module state through a different key hex.
      await expect(decryptNoteField(stored, NOTE_A)).rejects.toThrowError(
        /Decryption failed/,
      );
    });

    it("decodes a valid 64-hex-char key to exactly 32 bytes", async () => {
      // A valid schema key decodes to exactly 32 bytes: 64 hex chars -> 32 bytes.
      const keyHex = getEnv().NOTE_ENCRYPTION_KEY;
      expect(Buffer.from(keyHex, "hex")).toHaveLength(32);
    });
  });
});
