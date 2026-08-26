/**
 * Edge-compatible session token and cookie utilities for Scytala.
 * Implements stateless HMAC-SHA256 signed JWT session creation, verification,
 * and HttpOnly cookie header serialization for per-dashboard authentication.
 *
 * Runs identically in Node.js and Cloudflare Workers (V8 isolates) with zero native dependencies.
 */

export const DEFAULT_SESSION_TTL_SECONDS = 86400; // 24 hours
export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-scytala_session"
    : "scytala_session";

export interface SessionPayload {
  dashboard_id: string;
  dashboard_hash: string;
  user_id: string;
  user_alias: string;
  exp?: number;
  iat?: number;
}

export interface VerifiedSessionPayload {
  dashboard_id: string;
  dashboard_hash: string;
  user_id: string;
  user_alias: string;
  exp: number;
  iat: number;
}

/**
 * Base64URL encoding for Uint8Array bytes.
 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Base64URL decoding to Uint8Array bytes. Returns null if invalid or malformed.
 */
export function base64UrlToBytes(base64url: string): Uint8Array | null {
  if (typeof base64url !== "string" || !/^[A-Za-z0-9_-]*$/.test(base64url)) {
    return null;
  }
  try {
    let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) {
      base64 += "=";
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Encodes a UTF-8 string to Base64URL.
 */
export function stringToBase64Url(str: string): string {
  const encoder = new TextEncoder();
  return bytesToBase64Url(encoder.encode(str));
}

/**
 * Decodes a Base64URL string to a UTF-8 string. Returns null if invalid.
 */
export function base64UrlToString(base64url: string): string | null {
  const bytes = base64UrlToBytes(base64url);
  if (!bytes) {
    return null;
  }
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    return decoder.decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Imports a secret string as an HMAC-SHA256 CryptoKey.
 */
async function getHmacKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * Creates a signed JWT session token valid for ttlSeconds (default 24 hours).
 */
export async function createSessionToken(
  payload: Omit<SessionPayload, "exp" | "iat">,
  secret: string,
  ttlSeconds: number = DEFAULT_SESSION_TTL_SECONDS,
): Promise<string> {
  if (!secret || typeof secret !== "string") {
    throw new Error("Secret key is required to sign session tokens.");
  }

  if (
    !payload ||
    typeof payload.dashboard_id !== "string" ||
    !payload.dashboard_id ||
    typeof payload.dashboard_hash !== "string" ||
    !payload.dashboard_hash ||
    typeof payload.user_id !== "string" ||
    !payload.user_id ||
    typeof payload.user_alias !== "string" ||
    !payload.user_alias
  ) {
    throw new Error("Invalid session payload: required fields are missing or empty.");
  }

  const now = Math.floor(Date.now() / 1000);
  const ttl =
    typeof ttlSeconds === "number" &&
    Number.isFinite(ttlSeconds) &&
    ttlSeconds > 0
      ? Math.floor(ttlSeconds)
      : DEFAULT_SESSION_TTL_SECONDS;
  const exp = now + ttl;

  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const claims: SessionPayload = {
    dashboard_id: payload.dashboard_id,
    dashboard_hash: payload.dashboard_hash,
    user_id: payload.user_id,
    user_alias: payload.user_alias,
    iat: now,
    exp,
  };

  const headerB64 = stringToBase64Url(JSON.stringify(header));
  const payloadB64 = stringToBase64Url(JSON.stringify(claims));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const key = await getHmacKey(secret);
  const encoder = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(unsignedToken),
  );

  const signatureB64 = bytesToBase64Url(new Uint8Array(signatureBuffer));
  return `${unsignedToken}.${signatureB64}`;
}

/**
 * Verifies an HMAC-SHA256 signed JWT session token and returns payload if valid.
 * Returns null if token is malformed, expired, tampered, or invalid.
 */
export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<VerifiedSessionPayload | null> {
  if (
    typeof token !== "string" ||
    !token ||
    typeof secret !== "string" ||
    !secret
  ) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64 || !signatureB64) {
    return null;
  }

  // Parse and validate header
  const headerStr = base64UrlToString(headerB64);
  if (!headerStr) {
    return null;
  }

  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(headerStr);
  } catch {
    return null;
  }

  if (
    typeof header !== "object" ||
    header === null ||
    header.alg !== "HS256" ||
    header.typ !== "JWT"
  ) {
    return null;
  }

  // Parse and validate signature
  const signatureBytes = base64UrlToBytes(signatureB64);
  if (!signatureBytes || signatureBytes.length === 0) {
    return null;
  }

  try {
    const key = await getHmacKey(secret);
    const encoder = new TextEncoder();
    const unsignedToken = `${headerB64}.${payloadB64}`;
    const signatureBuffer = signatureBytes.buffer.slice(
      signatureBytes.byteOffset,
      signatureBytes.byteOffset + signatureBytes.byteLength,
    ) as ArrayBuffer;
    const isValidSignature = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBuffer,
      encoder.encode(unsignedToken),
    );

    if (!isValidSignature) {
      return null;
    }
  } catch {
    return null;
  }

  // Parse and validate payload claims
  const payloadStr = base64UrlToString(payloadB64);
  if (!payloadStr) {
    return null;
  }

  let claims: SessionPayload;
  try {
    claims = JSON.parse(payloadStr);
  } catch {
    return null;
  }

  if (
    typeof claims !== "object" ||
    claims === null ||
    typeof claims.dashboard_id !== "string" ||
    !claims.dashboard_id ||
    typeof claims.dashboard_hash !== "string" ||
    !claims.dashboard_hash ||
    typeof claims.user_id !== "string" ||
    !claims.user_id ||
    typeof claims.user_alias !== "string" ||
    !claims.user_alias
  ) {
    return null;
  }

  // Temporal claims checks (exp & iat claims - mandatory and finite)
  if (
    typeof claims.exp !== "number" ||
    !Number.isFinite(claims.exp) ||
    typeof claims.iat !== "number" ||
    !Number.isFinite(claims.iat)
  ) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp <= now) {
    return null;
  }

  return {
    dashboard_id: claims.dashboard_id,
    dashboard_hash: claims.dashboard_hash,
    user_id: claims.user_id,
    user_alias: claims.user_alias,
    exp: claims.exp,
    iat: claims.iat,
  };
}

/**
 * Builds standard HttpOnly, Secure Set-Cookie header string for session token.
 */
export function buildSessionCookieHeader(
  token: string,
  maxAge: number = DEFAULT_SESSION_TTL_SECONDS,
  cookieName: string = SESSION_COOKIE_NAME,
): string {
  return `${cookieName}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

/**
 * Builds Set-Cookie header string to immediately expire and clear session cookie.
 */
export function buildClearSessionCookieHeader(
  cookieName: string = SESSION_COOKIE_NAME,
): string {
  return `${cookieName}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/**
 * Extracts session token value from Cookie request header.
 */
export function extractSessionTokenFromCookieHeader(
  cookieHeader: string | null | undefined,
  cookieName: string = SESSION_COOKIE_NAME,
): string | null {
  if (!cookieHeader || typeof cookieHeader !== "string") {
    return null;
  }

  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [rawKey, ...rest] = cookie.split("=");
    if (rawKey?.trim() === cookieName) {
      let val = rest.join("=").trim();
      if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
        val = val.slice(1, -1);
      }
      return val || null;
    }
  }

  return null;
}

/**
 * Retrieves the session signing secret key from environment variables.
 * In production, throws an error if neither SESSION_SECRET nor SUPABASE_SERVICE_ROLE_KEY is configured.
 * In development/test environments, falls back to a development secret if unset.
 */
export function getSessionSecret(): string {
  const secret =
    process.env.SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY;

  if (secret && secret.trim().length > 0) {
    return secret.trim();
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Missing required session secret. Set SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY in production.",
    );
  }

  return "scytala-insecure-dev-secret-key-change-in-production-1234567890";
}
