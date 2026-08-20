import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_SESSION_TTL_SECONDS,
  SESSION_COOKIE_NAME,
  createSessionToken,
  verifySessionToken,
  buildSessionCookieHeader,
  buildClearSessionCookieHeader,
  extractSessionTokenFromCookieHeader,
  bytesToBase64Url,
  base64UrlToBytes,
  stringToBase64Url,
  base64UrlToString,
  type VerifiedSessionPayload,
} from '@/lib/session';

describe('src/lib/session', () => {
  const testSecret = 'super-secret-auth-key-1234567890';
  const testPayload = {
    dashboard_id: '11111111-2222-3333-4444-555555555555',
    dashboard_hash: 'AbCdEfGh123456_-',
    user_id: '99999999-8888-7777-6666-555555555555',
    user_alias: 'Alice',
  };

  describe('base64url helpers', () => {
    it('correctly encodes and decodes Uint8Array bytes', () => {
      const bytes = new Uint8Array([0, 1, 2, 250, 255, 128, 64]);
      const encoded = bytesToBase64Url(bytes);
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');

      const decoded = base64UrlToBytes(encoded);
      expect(decoded).not.toBeNull();
      expect(Array.from(decoded!)).toEqual(Array.from(bytes));
    });

    it('correctly encodes and decodes UTF-8 strings including unicode', () => {
      const text = 'Hello 🌍! Zażółć gęślą jaźń 🔐';
      const encoded = stringToBase64Url(text);
      const decoded = base64UrlToString(encoded);
      expect(decoded).toBe(text);
    });

    it('returns null for invalid base64url inputs in base64UrlToBytes', () => {
      // @ts-expect-error testing invalid runtime input
      expect(base64UrlToBytes(null)).toBeNull();
      // @ts-expect-error testing invalid runtime input
      expect(base64UrlToBytes(undefined)).toBeNull();
      // @ts-expect-error testing invalid runtime input
      expect(base64UrlToBytes(123)).toBeNull();
      expect(base64UrlToBytes('invalid+characters/')).toBeNull();
      expect(base64UrlToBytes('invalid=padding')).toBeNull();
    });

    it('handles atob throwing errors gracefully', () => {
      const originalAtob = globalThis.atob;
      globalThis.atob = vi.fn().mockImplementation(() => {
        throw new Error('atob error');
      });
      try {
        expect(base64UrlToBytes('YWJj')).toBeNull();
      } finally {
        globalThis.atob = originalAtob;
      }
    });

    it('returns null for invalid base64url string or invalid utf8 in base64UrlToString', () => {
      expect(base64UrlToString('invalid!@#')).toBeNull();
      // Invalid UTF-8 sequence (0xFF, 0xFF -> base64 '//8=' -> base64url '__8')
      expect(base64UrlToString('__8')).toBeNull();
    });
  });

  describe('createSessionToken', () => {
    it('creates a signed 3-part JWT token with 24h default expiration', async () => {
      const beforeTime = Math.floor(Date.now() / 1000);
      const token = await createSessionToken(testPayload, testSecret);
      const afterTime = Math.floor(Date.now() / 1000);

      const parts = token.split('.');
      expect(parts).toHaveLength(3);

      const headerJson = base64UrlToString(parts[0]);
      expect(headerJson).not.toBeNull();
      const header = JSON.parse(headerJson!);
      expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });

      const payloadJson = base64UrlToString(parts[1]);
      expect(payloadJson).not.toBeNull();
      const payload = JSON.parse(payloadJson!);

      expect(payload.dashboard_id).toBe(testPayload.dashboard_id);
      expect(payload.dashboard_hash).toBe(testPayload.dashboard_hash);
      expect(payload.user_id).toBe(testPayload.user_id);
      expect(payload.user_alias).toBe(testPayload.user_alias);
      expect(payload.iat).toBeGreaterThanOrEqual(beforeTime);
      expect(payload.iat).toBeLessThanOrEqual(afterTime);
      expect(payload.exp).toBe(payload.iat + DEFAULT_SESSION_TTL_SECONDS);
    });

    it('respects custom ttlSeconds and falls back to default for non-finite or non-positive values', async () => {
      const customTtl = 3600; // 1 hour
      const token = await createSessionToken(testPayload, testSecret, customTtl);
      const parts = token.split('.');
      const payload = JSON.parse(base64UrlToString(parts[1])!);

      expect(payload.exp - payload.iat).toBe(customTtl);

      // Non-positive or NaN values fall back to default
      const negativeToken = await createSessionToken(testPayload, testSecret, -10);
      const negPayload = JSON.parse(base64UrlToString(negativeToken.split('.')[1])!);
      expect(negPayload.exp - negPayload.iat).toBe(DEFAULT_SESSION_TTL_SECONDS);

      const nanToken = await createSessionToken(testPayload, testSecret, NaN);
      const nanPayload = JSON.parse(base64UrlToString(nanToken.split('.')[1])!);
      expect(nanPayload.exp - nanPayload.iat).toBe(DEFAULT_SESSION_TTL_SECONDS);

      const infinityToken = await createSessionToken(testPayload, testSecret, Infinity);
      const infPayload = JSON.parse(base64UrlToString(infinityToken.split('.')[1])!);
      expect(infPayload.exp - infPayload.iat).toBe(DEFAULT_SESSION_TTL_SECONDS);
    });

    it('throws error when secret is empty or not a string', async () => {
      await expect(createSessionToken(testPayload, '')).rejects.toThrow(
        'Secret key is required to sign session tokens.'
      );
      // @ts-expect-error testing invalid runtime input
      await expect(createSessionToken(testPayload, null)).rejects.toThrow(
        'Secret key is required to sign session tokens.'
      );
    });

    it('throws error when payload is missing required fields', async () => {
      // @ts-expect-error testing invalid runtime input
      await expect(createSessionToken(null, testSecret)).rejects.toThrow(
        'Invalid session payload'
      );
      await expect(
        createSessionToken({ ...testPayload, dashboard_id: '' }, testSecret)
      ).rejects.toThrow('Invalid session payload');
      await expect(
        // @ts-expect-error testing invalid runtime input
        createSessionToken({ ...testPayload, dashboard_id: 123 }, testSecret)
      ).rejects.toThrow('Invalid session payload');
      await expect(
        createSessionToken({ ...testPayload, dashboard_hash: '' }, testSecret)
      ).rejects.toThrow('Invalid session payload');
      await expect(
        // @ts-expect-error testing invalid runtime input
        createSessionToken({ ...testPayload, dashboard_hash: 123 }, testSecret)
      ).rejects.toThrow('Invalid session payload');
      await expect(
        createSessionToken({ ...testPayload, user_id: '' }, testSecret)
      ).rejects.toThrow('Invalid session payload');
      await expect(
        // @ts-expect-error testing invalid runtime input
        createSessionToken({ ...testPayload, user_id: 123 }, testSecret)
      ).rejects.toThrow('Invalid session payload');
      await expect(
        createSessionToken({ ...testPayload, user_alias: '' }, testSecret)
      ).rejects.toThrow('Invalid session payload');
      await expect(
        // @ts-expect-error testing invalid runtime input
        createSessionToken({ ...testPayload, user_alias: 123 }, testSecret)
      ).rejects.toThrow('Invalid session payload');
    });
  });

  describe('verifySessionToken', () => {
    it('verifies and returns payload for valid signed token', async () => {
      const token = await createSessionToken(testPayload, testSecret);
      const verified = await verifySessionToken(token, testSecret);

      expect(verified).not.toBeNull();
      expect(verified?.dashboard_id).toBe(testPayload.dashboard_id);
      expect(verified?.dashboard_hash).toBe(testPayload.dashboard_hash);
      expect(verified?.user_id).toBe(testPayload.user_id);
      expect(verified?.user_alias).toBe(testPayload.user_alias);
      expect(typeof verified?.exp).toBe('number');
      expect(typeof verified?.iat).toBe('number');
    });

    it('rejects token signed with a different secret', async () => {
      const token = await createSessionToken(testPayload, testSecret);
      const verified = await verifySessionToken(token, 'different-secret-key');
      expect(verified).toBeNull();
    });

    it('rejects expired tokens', async () => {
      const token = await createSessionToken(testPayload, testSecret, 1);

      vi.useFakeTimers();
      try {
        vi.advanceTimersByTime(2000);
        const verified = await verifySessionToken(token, testSecret);
        expect(verified).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('rejects token with modified payload claims (tampering)', async () => {
      const token = await createSessionToken(testPayload, testSecret);
      const [headerB64, payloadB64, signatureB64] = token.split('.');

      const payload = JSON.parse(base64UrlToString(payloadB64)!);
      payload.user_alias = 'Attacker';
      const tamperedPayloadB64 = stringToBase64Url(JSON.stringify(payload));

      const tamperedToken = `${headerB64}.${tamperedPayloadB64}.${signatureB64}`;
      const verified = await verifySessionToken(tamperedToken, testSecret);
      expect(verified).toBeNull();
    });

    it('rejects token with modified header (tampering)', async () => {
      const token = await createSessionToken(testPayload, testSecret);
      const [, payloadB64, signatureB64] = token.split('.');

      const tamperedHeader = { alg: 'none', typ: 'JWT' };
      const tamperedHeaderB64 = stringToBase64Url(JSON.stringify(tamperedHeader));

      const tamperedToken = `${tamperedHeaderB64}.${payloadB64}.${signatureB64}`;
      expect(await verifySessionToken(tamperedToken, testSecret)).toBeNull();

      const invalidTypHeader = stringToBase64Url(JSON.stringify({ alg: 'HS256', typ: 'INVALID' }));
      expect(await verifySessionToken(`${invalidTypHeader}.${payloadB64}.${signatureB64}`, testSecret)).toBeNull();

      const notAnObjectHeader = stringToBase64Url('12345');
      expect(await verifySessionToken(`${notAnObjectHeader}.${payloadB64}.${signatureB64}`, testSecret)).toBeNull();
    });

    it('rejects token with corrupted signature bytes', async () => {
      const token = await createSessionToken(testPayload, testSecret);
      const [headerB64, payloadB64, signatureB64] = token.split('.');

      const corruptedSig = signatureB64.slice(0, -2) + (signatureB64.endsWith('aa') ? 'bb' : 'aa');
      const corruptedToken = `${headerB64}.${payloadB64}.${corruptedSig}`;

      const verified = await verifySessionToken(corruptedToken, testSecret);
      expect(verified).toBeNull();
    });

    it('returns null for empty or invalid token / secret arguments', async () => {
      // @ts-expect-error testing invalid runtime input
      expect(await verifySessionToken(null, testSecret)).toBeNull();
      // @ts-expect-error testing invalid runtime input
      expect(await verifySessionToken(undefined, testSecret)).toBeNull();
      expect(await verifySessionToken('', testSecret)).toBeNull();
      // @ts-expect-error testing invalid runtime input
      expect(await verifySessionToken(12345, testSecret)).toBeNull();

      const validToken = await createSessionToken(testPayload, testSecret);
      // @ts-expect-error testing invalid runtime input
      expect(await verifySessionToken(validToken, null)).toBeNull();
      // @ts-expect-error testing invalid runtime input
      expect(await verifySessionToken(validToken, undefined)).toBeNull();
      expect(await verifySessionToken(validToken, '')).toBeNull();
    });

    it('returns null for tokens with invalid segment counts or empty segments', async () => {
      expect(await verifySessionToken('one.two', testSecret)).toBeNull();
      expect(await verifySessionToken('one.two.three.four', testSecret)).toBeNull();
      expect(await verifySessionToken('..', testSecret)).toBeNull();
      expect(await verifySessionToken('.two.three', testSecret)).toBeNull();
      expect(await verifySessionToken('one..three', testSecret)).toBeNull();
      expect(await verifySessionToken('one.two.', testSecret)).toBeNull();
    });

    it('returns null for tokens with invalid base64 in header, signature, or payload', async () => {
      const validToken = await createSessionToken(testPayload, testSecret);
      const [h, p, s] = validToken.split('.');

      // Invalid base64 in header (e.g. invalid chars or invalid UTF8)
      expect(await verifySessionToken(`__8.${p}.${s}`, testSecret)).toBeNull();
      expect(await verifySessionToken(`!@#.${p}.${s}`, testSecret)).toBeNull();

      // Invalid base64 in signature
      expect(await verifySessionToken(`${h}.${p}.!@#`, testSecret)).toBeNull();

      // Invalid base64 or UTF8 in payload
      expect(await verifySessionToken(`${h}.__8.${s}`, testSecret)).toBeNull();
      expect(await verifySessionToken(`${h}.!@#.${s}`, testSecret)).toBeNull();
    });

    it('returns null for tokens with malformed JSON in header or payload', async () => {
      const notJson = stringToBase64Url('not json');
      const dummySig = stringToBase64Url('sig');

      expect(await verifySessionToken(`${notJson}.${notJson}.${dummySig}`, testSecret)).toBeNull();
    });

    it('returns null if subtle.verify throws an exception', async () => {
      const token = await createSessionToken(testPayload, testSecret);
      const originalVerify = crypto.subtle.verify;
      crypto.subtle.verify = vi.fn().mockRejectedValue(new Error('Crypto subsystem error'));
      try {
        expect(await verifySessionToken(token, testSecret)).toBeNull();
      } finally {
        crypto.subtle.verify = originalVerify;
      }
    });

    it('returns null for payload missing required fields after signature verification', async () => {
      const header = { alg: 'HS256', typ: 'JWT' };
      const hB64 = stringToBase64Url(JSON.stringify(header));

      const signCustomPayload = async (rawPayloadB64: string) => {
        const unsigned = `${hB64}.${rawPayloadB64}`;
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          'raw',
          encoder.encode(testSecret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(unsigned));
        return `${unsigned}.${bytesToBase64Url(new Uint8Array(sig))}`;
      };

      const signPayload = async (payloadObj: unknown) => {
        return signCustomPayload(stringToBase64Url(JSON.stringify(payloadObj)));
      };

      // Non-JSON string payload
      expect(await verifySessionToken(await signCustomPayload(stringToBase64Url('not-a-json-object')), testSecret)).toBeNull();

      // Non-UTF8 payload with valid signature
      expect(await verifySessionToken(await signCustomPayload('__8'), testSecret)).toBeNull();

      // Non-object payload
      expect(await verifySessionToken(await signPayload(12345), testSecret)).toBeNull();
      expect(await verifySessionToken(await signPayload(null), testSecret)).toBeNull();

      // Token without exp claim or non-finite exp is rejected
      const baseValidPayload = {
        ...testPayload,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      expect(await verifySessionToken(await signPayload({ ...baseValidPayload, exp: undefined }), testSecret)).toBeNull();
      expect(await verifySessionToken(await signPayload({ ...baseValidPayload, exp: 'never' }), testSecret)).toBeNull();
      expect(await verifySessionToken(await signPayload({ ...baseValidPayload, exp: NaN }), testSecret)).toBeNull();

      // Token without iat claim or non-finite iat is rejected
      expect(await verifySessionToken(await signPayload({ ...baseValidPayload, iat: undefined }), testSecret)).toBeNull();
      expect(await verifySessionToken(await signPayload({ ...baseValidPayload, iat: 'invalid' }), testSecret)).toBeNull();
      expect(await verifySessionToken(await signPayload({ ...baseValidPayload, iat: NaN }), testSecret)).toBeNull();

      // Missing dashboard_id
      expect(await verifySessionToken(await signPayload({ ...baseValidPayload, dashboard_id: '' }), testSecret)).toBeNull();
      expect(await verifySessionToken(await signPayload({ ...baseValidPayload, dashboard_id: 123 }), testSecret)).toBeNull();

      // Missing dashboard_hash
      expect(await verifySessionToken(await signPayload({ ...baseValidPayload, dashboard_hash: '' }), testSecret)).toBeNull();
      expect(await verifySessionToken(await signPayload({ ...baseValidPayload, dashboard_hash: 123 }), testSecret)).toBeNull();

      // Missing user_id
      expect(await verifySessionToken(await signPayload({ ...baseValidPayload, user_id: '' }), testSecret)).toBeNull();
      expect(await verifySessionToken(await signPayload({ ...baseValidPayload, user_id: 123 }), testSecret)).toBeNull();

      // Missing user_alias
      expect(await verifySessionToken(await signPayload({ ...baseValidPayload, user_alias: '' }), testSecret)).toBeNull();
      expect(await verifySessionToken(await signPayload({ ...baseValidPayload, user_alias: 123 }), testSecret)).toBeNull();
    });
  });

  describe('cookie utilities', () => {
    it('builds standard session cookie header with defaults', () => {
      const dummyToken = 'header.payload.signature';
      const cookieHeader = buildSessionCookieHeader(dummyToken);

      expect(cookieHeader).toBe(
        `${SESSION_COOKIE_NAME}=${dummyToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${DEFAULT_SESSION_TTL_SECONDS}`
      );
    });

    it('uses __Host- prefix for cookie name when in production environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        // Re-import to evaluate production branch
        const sessionModule = await import('@/lib/session');
        expect(sessionModule.SESSION_COOKIE_NAME).toBe('__Host-scytala_session');
        const header = sessionModule.buildSessionCookieHeader('dummy-token');
        expect(header).toContain('__Host-scytala_session=dummy-token');
        expect(header).toContain('Secure');
        expect(header).toContain('Path=/');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('builds cookie header with custom maxAge and cookieName', () => {
      const dummyToken = 'header.payload.signature';
      const cookieHeader = buildSessionCookieHeader(dummyToken, 7200, 'custom_cookie');

      expect(cookieHeader).toBe(
        'custom_cookie=header.payload.signature; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=7200'
      );
    });

    it('builds clear cookie header expiring immediately', () => {
      const clearHeader = buildClearSessionCookieHeader();
      expect(clearHeader).toBe(
        `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
      );

      const customClearHeader = buildClearSessionCookieHeader('custom_cookie');
      expect(customClearHeader).toBe(
        'custom_cookie=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
      );
    });

    it('extracts session token from Cookie header correctly', () => {
      const token = 'header.payload.signature';
      const headerStr = `other_val=123; ${SESSION_COOKIE_NAME}=${token}; theme=dark`;
      expect(extractSessionTokenFromCookieHeader(headerStr)).toBe(token);

      const singleCookie = `${SESSION_COOKIE_NAME}=${token}`;
      expect(extractSessionTokenFromCookieHeader(singleCookie)).toBe(token);

      // Quoted value and surrounding whitespace
      const quotedCookie = `  ${SESSION_COOKIE_NAME}  =  "${token}"  ; other=123`;
      expect(extractSessionTokenFromCookieHeader(quotedCookie)).toBe(token);

      expect(extractSessionTokenFromCookieHeader(`${SESSION_COOKIE_NAME}=`)).toBeNull();
      expect(extractSessionTokenFromCookieHeader(`${SESSION_COOKIE_NAME}=""`)).toBeNull();
      expect(extractSessionTokenFromCookieHeader('other_val=123; theme=dark')).toBeNull();
      expect(extractSessionTokenFromCookieHeader(null)).toBeNull();
      expect(extractSessionTokenFromCookieHeader(undefined)).toBeNull();
      expect(extractSessionTokenFromCookieHeader('')).toBeNull();
      // @ts-expect-error testing invalid runtime input
      expect(extractSessionTokenFromCookieHeader(12345)).toBeNull();
    });
  });
});
