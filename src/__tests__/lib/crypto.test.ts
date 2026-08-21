import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  generateDashboardSlug,
  generateRandomPassword,
} from '@/lib/crypto';

describe('src/lib/crypto', () => {
  describe('hashPassword', () => {
    it('generates a formatted PBKDF2 hash with 100,000 iterations', async () => {
      const password = 'mySecretPassword123!';
      const hash = await hashPassword(password);

      // Expected format: $pbkdf2$100000$<salt_hex:32 chars>$<hash_hex:64 chars>
      const pattern = /^\$pbkdf2\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/;
      expect(hash).toMatch(pattern);
    });

    it('generates unique salts and distinct hashes for identical passwords', async () => {
      const password = 'identicalPassword';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);

      const parts1 = hash1.split('$');
      const parts2 = hash2.split('$');

      // Salt should be distinct
      expect(parts1[3]).not.toBe(parts2[3]);
      // Hash should be distinct
      expect(parts1[4]).not.toBe(parts2[4]);
    });

    it('handles empty and unicode passwords', async () => {
      const emptyHash = await hashPassword('');
      expect(emptyHash).toMatch(/^\$pbkdf2\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);

      const unicodeHash = await hashPassword('🔑 Zażółć gęślą jaźń 🛡️');
      expect(unicodeHash).toMatch(/^\$pbkdf2\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    });
  });

  describe('verifyPassword', () => {
    it('returns true for a matching password', async () => {
      const password = 'correctPassword!#42';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('returns false for an incorrect password', async () => {
      const password = 'correctPassword';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword('wrongPassword', hash);
      expect(isValid).toBe(false);
    });

    it('returns false for slightly altered password (case sensitivity)', async () => {
      const password = 'CaseSensitivePassword';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword('casesensitivepassword', hash);
      expect(isValid).toBe(false);
    });

    it('returns false for empty or non-string password inputs', async () => {
      const hash = await hashPassword('correctPassword');
      // @ts-expect-error testing invalid runtime input
      expect(await verifyPassword(null, hash)).toBe(false);
      // @ts-expect-error testing invalid runtime input
      expect(await verifyPassword(undefined, hash)).toBe(false);
      // @ts-expect-error testing invalid runtime input
      expect(await verifyPassword(12345, hash)).toBe(false);
      // @ts-expect-error testing invalid runtime input
      expect(await verifyPassword({}, hash)).toBe(false);
    });

    it('returns false for empty or non-string storedHash inputs', async () => {
      // @ts-expect-error testing invalid runtime input
      expect(await verifyPassword('password', null)).toBe(false);
      // @ts-expect-error testing invalid runtime input
      expect(await verifyPassword('password', undefined)).toBe(false);
      // @ts-expect-error testing invalid runtime input
      expect(await verifyPassword('password', 12345)).toBe(false);
      expect(await verifyPassword('password', '')).toBe(false);
    });

    it('returns false for malformed hash prefixes or segment counts', async () => {
      expect(await verifyPassword('password', 'pbkdf2$100000$abcd$ef01')).toBe(false);
      expect(await verifyPassword('password', '$bcrypt$100000$abcd$ef01')).toBe(false);
      expect(await verifyPassword('password', '$pbkdf2$100000$abcd')).toBe(false);
      expect(await verifyPassword('password', '$pbkdf2$100000$abcd$ef01$extra')).toBe(false);
    });

    it('returns false for invalid iteration counts or bounds violations', async () => {
      expect(await verifyPassword('password', '$pbkdf2$invalid$00112233445566778899aabbccddeeff$00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff')).toBe(false);
      expect(await verifyPassword('password', '$pbkdf2$100000abc$00112233445566778899aabbccddeeff$00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff')).toBe(false);
      expect(await verifyPassword('password', '$pbkdf2$0$00112233445566778899aabbccddeeff$00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff')).toBe(false);
      expect(await verifyPassword('password', '$pbkdf2$500$00112233445566778899aabbccddeeff$00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff')).toBe(false);
      expect(await verifyPassword('password', '$pbkdf2$2000000$00112233445566778899aabbccddeeff$00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff')).toBe(false);
      expect(await verifyPassword('password', '$pbkdf2$-100$00112233445566778899aabbccddeeff$00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff')).toBe(false);
      expect(await verifyPassword('password', '$pbkdf2$100.5$00112233445566778899aabbccddeeff$00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff')).toBe(false);
    });

    it('returns false for invalid salt hexadecimal strings', async () => {
      // Odd length hex
      expect(await verifyPassword('password', '$pbkdf2$100000$abc$00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff')).toBe(false);
      // Non-hex chars
      expect(await verifyPassword('password', '$pbkdf2$100000$zzxx112233445566778899aabbccddeeff$00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff')).toBe(false);
      // Empty salt
      expect(await verifyPassword('password', '$pbkdf2$100000$$00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff')).toBe(false);
    });

    it('returns false for invalid hash hexadecimal strings', async () => {
      // Odd length hex
      expect(await verifyPassword('password', '$pbkdf2$100000$00112233445566778899aabbccddeeff$abc')).toBe(false);
      // Non-hex chars
      expect(await verifyPassword('password', '$pbkdf2$100000$00112233445566778899aabbccddeeff$not_hex_chars_here!!')).toBe(false);
      // Empty hash
      expect(await verifyPassword('password', '$pbkdf2$100000$00112233445566778899aabbccddeeff$')).toBe(false);
    });

    it('returns false if hash length differs', async () => {
      // 16-byte hash instead of 32-byte hash
      const shortHash = '$pbkdf2$100000$00112233445566778899aabbccddeeff$00112233445566778899aabbccddeeff';
      expect(await verifyPassword('password', shortHash)).toBe(false);
    });
  });

  describe('generateDashboardSlug', () => {
    it('generates a 16-character URL-safe string by default', () => {
      const slug = generateDashboardSlug();
      expect(slug).toHaveLength(16);
      expect(slug).toMatch(/^[A-Za-z0-9_-]{16}$/);
    });

    it('respects custom length parameter', () => {
      expect(generateDashboardSlug(8)).toHaveLength(8);
      expect(generateDashboardSlug(8)).toMatch(/^[A-Za-z0-9_-]{8}$/);
      expect(generateDashboardSlug(32)).toHaveLength(32);
      expect(generateDashboardSlug(32)).toMatch(/^[A-Za-z0-9_-]{32}$/);
    });

    it('returns empty string for length <= 0', () => {
      expect(generateDashboardSlug(0)).toBe('');
      expect(generateDashboardSlug(-5)).toBe('');
    });

    it('produces high entropy distinct slugs', () => {
      const slugs = new Set<string>();
      for (let i = 0; i < 100; i++) {
        slugs.add(generateDashboardSlug());
      }
      expect(slugs.size).toBe(100);
    });
  });

  describe('generateRandomPassword', () => {
    it('generates a 16-character strong password by default', () => {
      const password = generateRandomPassword();
      expect(password).toHaveLength(16);
    });

    it('respects custom length parameter', () => {
      const password24 = generateRandomPassword(24);
      expect(password24).toHaveLength(24);
    });

    it('clamps minimum length to 4 to preserve character classes', () => {
      const password = generateRandomPassword(2);
      expect(password).toHaveLength(4);
    });

    it('contains uppercase, lowercase, digits, and symbol characters', () => {
      const password = generateRandomPassword(16);
      const hasUpper = /[A-Z]/.test(password);
      const hasLower = /[a-z]/.test(password);
      const hasDigit = /[0-9]/.test(password);
      const hasSymbol = /[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(password);

      expect(hasUpper).toBe(true);
      expect(hasLower).toBe(true);
      expect(hasDigit).toBe(true);
      expect(hasSymbol).toBe(true);
    });

    it('supports lengths > 256 without infinite loops or rejection bias', () => {
      const password300 = generateRandomPassword(300);
      expect(password300).toHaveLength(300);
    });

    it('clamps maximum length to 1024', () => {
      const passwordTooLong = generateRandomPassword(2000);
      expect(passwordTooLong).toHaveLength(1024);
    });

    it('produces unique passwords across multiple invocations', () => {
      const passwords = new Set<string>();
      for (let i = 0; i < 50; i++) {
        passwords.add(generateRandomPassword());
      }
      expect(passwords.size).toBe(50);
    });
  });
});
