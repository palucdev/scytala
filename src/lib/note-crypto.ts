/**
 * AES-256-GCM envelope encryption for note titles and content (edge-compatible, WebCrypto).
 *
 * Envelope format stored in TEXT columns (notes + note_versions):
 *   v1:<iv_128bit_b64>:<ciphertext_b64>
 *
 * Semantics:
 * - Encryption skips the empty string (carve-out: an empty string can never be a valid envelope).
 * - Plaintext that already starts with the literal "v1:" is escaped at write time as
 *   "v0:<original>" (a passthrough marker, NOT encrypted) so the dual-format reader never
 *   misinterprets user content as an envelope.
 * - Decryption recognizes exactly three shapes:
 *     v1: -> AES-256-GCM decrypt with AAD = noteId; any failure throws (fail closed)
 *     v0: -> strip the marker, return the rest unchanged
 *     no recognized prefix -> legacy plaintext passthrough
 * - AAD = note ID (UTF-8) binds ciphertext to its row; cross-row decrypts fail.
 *
 * Key: getEnv().NOTE_ENCRYPTION_KEY — a 64-hex-char string decoded to exactly 32 bytes
 * (AES-256 raw key material), following the hex helper style of src/lib/crypto.ts.
 */

import { getEnv } from "@/lib/env";

const ENVELOPE_VERSION = "v1";
const PASSTHROUGH_PREFIX = "v0";
const IV_BYTE_LENGTH = 16; // 128-bit random IV per write
const AES_KEY_BYTE_LENGTH = 32;
const BASE64_CHUNK_SIZE = 0x8000;

// AAD binding requires an explicit noteId for every (de)cipher operation.
const encoder = new TextEncoder();

/**
 * Converts bytes to base64 using chunked conversion to avoid
 * String.fromCharCode spread on unbounded arrays.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + BASE64_CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Parses a hexadecimal string into exactly 32 bytes for AES-256 raw import.
 * Returns null if the string is not valid hex of the right length.
 */
function hexToAesKeyBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (
    hex.length !== AES_KEY_BYTE_LENGTH * 2 ||
    !/^[0-9a-fA-F]+$/.test(hex)
  ) {
    return null;
  }
  const bytes = new Uint8Array(AES_KEY_BYTE_LENGTH) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < AES_KEY_BYTE_LENGTH; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

let cachedKeyHex: string | null = null;
let cachedKey: CryptoKey | null = null;

async function getAesKey(): Promise<CryptoKey> {
  const keyHex = getEnv().NOTE_ENCRYPTION_KEY;
  if (cachedKey && cachedKeyHex === keyHex) {
    return cachedKey;
  }

  const keyBytes = hexToAesKeyBytes(keyHex);
  if (!keyBytes) {
    throw new Error(
      "[note-crypto] NOTE_ENCRYPTION_KEY must decode to exactly 32 bytes for AES-256 raw import",
    );
  }

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );

  cachedKeyHex = keyHex;
  cachedKey = key;
  return key;
}

/**
 * Strict prefix check for the v1 envelope format.
 */
export function isEncryptedEnvelope(value: string): boolean {
  return value.startsWith(`${ENVELOPE_VERSION}:`);
}

/**
 * Encrypts a note field. Returns "" unchanged for empty input; escapes
 * plaintext starting with "v1:" as "v0:<original>" (passthrough marker).
 */
export async function encryptNoteField(
  plaintext: string,
  noteId: string,
): Promise<string> {
  if (plaintext === "") {
    return "";
  }
  if (plaintext.startsWith(`${ENVELOPE_VERSION}:`)) {
    return `${PASSTHROUGH_PREFIX}:${plaintext}`;
  }

  const key = await getAesKey();
  const iv = new Uint8Array(IV_BYTE_LENGTH);
  crypto.getRandomValues(iv);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(noteId) },
    key,
    encoder.encode(plaintext),
  );

  return `${ENVELOPE_VERSION}:${bytesToBase64(iv)}:${bytesToBase64(
    new Uint8Array(ciphertext),
  )}`;
}

/**
 * Decrypts a stored note field. Non-envelope values pass through unchanged
 * (legacy plaintext or v0 passthrough marker); v1 envelopes are decrypted
 * with AAD = noteId and any failure throws (fail closed).
 */
export async function decryptNoteField(
  stored: string,
  noteId: string,
): Promise<string> {
  if (stored.startsWith(`${PASSTHROUGH_PREFIX}:`)) {
    return stored.slice(PASSTHROUGH_PREFIX.length + 1);
  }
  if (!isEncryptedEnvelope(stored)) {
    return stored;
  }

  const parts = stored.split(":");
  if (parts.length !== 3) {
    throw new Error(
      "[note-crypto] Malformed encryption envelope: expected v1:<iv>:<ciphertext>",
    );
  }
  const [, rawIv, rawCiphertext] = parts;

  try {
    const iv = base64ToBytes(rawIv);
    const ciphertext = base64ToBytes(rawCiphertext);
    const key = await getAesKey();

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: encoder.encode(noteId) },
      key,
      ciphertext,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error(
      "[note-crypto] Decryption failed: AES-GCM authentication rejected the envelope (tampered data, wrong key, or mismatched note ID)",
    );
  }
}
