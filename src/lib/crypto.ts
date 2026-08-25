/**
 * Edge-compatible cryptographic utilities for Scytala.
 * Implements Web Crypto API primitives (crypto.subtle) for password hashing (PBKDF2),
 * constant-time verification, URL-safe slug generation, and secure password generation.
 *
 * Runs identically in Node.js and Cloudflare Workers (V8 isolates) with zero native dependencies.
 */

// Standard iteration count (100,000 rounds of SHA-256 PBKDF2).
// Higher iteration counts increase the computational cost for attackers attempting brute-force
// or dictionary attacks, while keeping password hashing/verification fast (~50ms) in Edge runtime.
const PBKDF2_ITERATIONS = 100000;

// Defensive iteration bounds during verification:
// - MIN prevents trivially weak iterations that compromise security.
// - MAX prevents CPU exhaustion (Denial of Service) attacks where an attacker provides a crafted
//   hash with extreme iteration counts (e.g. 50M+) that would lock up the server/isolate CPU thread.
const MIN_PBKDF2_ITERATIONS = 1000;
const MAX_PBKDF2_ITERATIONS = 1000000;

export const DEFAULT_DASHBOARD_SLUG_LENGTH = 16;
export const DEFAULT_PASSWORD_LENGTH = 16;

const SALT_BYTE_LENGTH = 16;
const KEY_BIT_LENGTH = 256;

const SLUG_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

const UPPERCASE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWERCASE_CHARS = "abcdefghijklmnopqrstuvwxyz";
const DIGIT_CHARS = "0123456789";
const SYMBOL_CHARS = "!@#$%^&*()_+-=[]{}|;:,.<>?";
const ALL_PASSWORD_CHARS =
  UPPERCASE_CHARS + LOWERCASE_CHARS + DIGIT_CHARS + SYMBOL_CHARS;

/**
 * Converts a Uint8Array to a lowercase hexadecimal string.
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Parses a hexadecimal string into a Uint8Array. Returns null if invalid.
 */
function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    return null;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Constant-time comparison of two Uint8Array buffers to protect against timing attacks.
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.byteLength; i++) {
    mismatch |= a[i] ^ b[i];
  }
  return mismatch === 0;
}

/**
 * Derives a PBKDF2 (SHA-256) hash for a given password and salt.
 */
async function derivePbkdf2Hash(
  password: string,
  salt: Uint8Array,
  iterations: number,
  bitLength: number = KEY_BIT_LENGTH,
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations,
      hash: "SHA-256",
    },
    passwordKey,
    bitLength,
  );

  return new Uint8Array(derivedBits);
}

/**
 * Hashes a password using PBKDF2 with SHA-256, 100k iterations, and a 16-byte random salt.
 * Returns formatted string: `$pbkdf2$100000$<salt_hex>$<hash_hex>`.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(SALT_BYTE_LENGTH);
  crypto.getRandomValues(salt);

  const hashBytes = await derivePbkdf2Hash(
    password,
    salt,
    PBKDF2_ITERATIONS,
    KEY_BIT_LENGTH,
  );

  const saltHex = bytesToHex(salt);
  const hashHex = bytesToHex(hashBytes);

  return `$pbkdf2$${PBKDF2_ITERATIONS}$${saltHex}$${hashHex}`;
}

/**
 * Verifies a plain text password against a stored PBKDF2 hash using constant-time comparison.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  if (
    typeof password !== "string" ||
    typeof storedHash !== "string" ||
    !storedHash
  ) {
    return false;
  }

  // Format: $pbkdf2$<iterations>$<salt_hex>$<hash_hex>
  const parts = storedHash.split("$");
  const [start, algo, rawIterations, rawSalt, hash] = parts;
  if (parts.length !== 5 || start !== "" || algo !== "pbkdf2") {
    return false;
  }

  if (!/^\d+$/.test(rawIterations)) {
    return false;
  }

  const iterations = parseInt(rawIterations, 10);
  if (
    iterations < MIN_PBKDF2_ITERATIONS ||
    iterations > MAX_PBKDF2_ITERATIONS
  ) {
    return false;
  }

  const salt = hexToBytes(rawSalt);
  if (!salt || salt.length === 0) {
    return false;
  }

  const expectedHash = hexToBytes(hash);
  if (!expectedHash || expectedHash.length === 0) {
    return false;
  }

  const computedHash = await derivePbkdf2Hash(
    password,
    salt,
    iterations,
    KEY_BIT_LENGTH,
  );

  return constantTimeEqual(computedHash, expectedHash);
}

/**
 * Generates a URL-safe random string (default 16 chars from [A-Za-z0-9_-]) using crypto.getRandomValues.
 */
export function generateDashboardSlug(
  length: number = DEFAULT_DASHBOARD_SLUG_LENGTH,
): string {
  if (length <= 0) {
    return "";
  }

  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);

  // SLUG_CHARSET has 64 characters (2^6).
  // Bitwise AND (& 0x3F) maps 0-255 uniformly to 0-63 without modulo bias.
  let slug = "";
  for (let i = 0; i < length; i++) {
    slug += SLUG_CHARSET[randomBytes[i] & 0x3f];
  }

  return slug;
}

/**
 * Selects a random integer in range [0, max) with uniform distribution using rejection sampling.
 */
function getUniformRandomInt(max: number): number {
  if (max <= 1) {
    return 0;
  }
  const maxUint32 = 0x100000000;
  const limit = maxUint32 - (maxUint32 % max);
  const buffer = new Uint32Array(1);
  while (true) {
    crypto.getRandomValues(buffer);
    if (buffer[0] < limit) {
      return buffer[0] % max;
    }
  }
}

/**
 * Generates a strong random password (default 16 chars with mixed case, digits, and symbols).
 * Guarantees inclusion of at least one character from each character class (uppercase, lowercase, digit, symbol).
 */
export function generateRandomPassword(
  length: number = DEFAULT_PASSWORD_LENGTH,
): string {
  if (length < 4) {
    length = 4; // Minimum length to satisfy character class constraints
  }
  if (length > 1024) {
    length = 1024;
  }

  const result: string[] = [
    UPPERCASE_CHARS[getUniformRandomInt(UPPERCASE_CHARS.length)],
    LOWERCASE_CHARS[getUniformRandomInt(LOWERCASE_CHARS.length)],
    DIGIT_CHARS[getUniformRandomInt(DIGIT_CHARS.length)],
    SYMBOL_CHARS[getUniformRandomInt(SYMBOL_CHARS.length)],
  ];

  for (let i = 4; i < length; i++) {
    result.push(
      ALL_PASSWORD_CHARS[getUniformRandomInt(ALL_PASSWORD_CHARS.length)],
    );
  }

  // Fisher-Yates shuffle using cryptographically secure random values
  for (let i = result.length - 1; i > 0; i--) {
    const j = getUniformRandomInt(i + 1);
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }

  return result.join("");
}
