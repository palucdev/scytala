/**
 * AES-256-GCM envelope encryption for note titles and content (edge-compatible, WebCrypto).
 *
 * Envelope format stored in TEXT columns (notes + note_versions):
 *   v1:<iv_128bit_b64>:<ciphertext_b64>
 *
 * Semantics:
 * - Every stored value is a v1 envelope — encryption always encrypts, including
 *   the empty string. No plaintext passthrough exists (review decision, 2026-09-13).
 * - Decryption accepts only a valid v1 envelope:
 *     v1: -> AES-256-GCM decrypt with AAD = noteId; any failure throws (fail closed)
 *     anything else -> throws (fail closed; no legacy/plaintext support)
 * - AAD = note ID (UTF-8) binds ciphertext to its note. Decrypts under a
 *   different note's ID fail; transplants between versions of the SAME note
 *   still authenticate (version rows share AAD = note_id, row identity there
 *   is (note_id, version)).
 *
 * Key: getEnv().NOTE_ENCRYPTION_KEY — a 64-hex-char string decoded to exactly 32 bytes
 * (AES-256 raw key material), following the hex helper style of src/lib/crypto.ts.
 */

import { getEnv } from "@/lib/env";

const ENVELOPE_VERSION = "v1";
const IV_BYTE_LENGTH = 16; // 128-bit random IV per write
const AES_KEY_BYTE_LENGTH = 32;
const BASE64_CHUNK_SIZE = 0x8000;

/**
 * Typed error for all note-crypto failures (malformed envelope, GCM
 * authentication failure, key problems). Callers classify decrypt failures
 * via `instanceof` instead of matching on message strings.
 */
export class NoteCryptoError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NoteCryptoError";
  }
}

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
 * Encrypts a note field into a v1 envelope. Always encrypts — including the
 * empty string — so every stored value is an encrypted envelope.
 */
export async function encryptNoteField(
  plaintext: string,
  noteId: string,
): Promise<string> {
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
 * Decrypts a stored note field. Only valid v1 envelopes are accepted;
 * any non-envelope value or decrypt failure throws (fail closed).
 */
export async function decryptNoteField(
  stored: string,
  noteId: string,
): Promise<string> {
  if (!isEncryptedEnvelope(stored)) {
    throw new NoteCryptoError(
      "[note-crypto] Not an encrypted envelope: every stored note field must be a v1 envelope",
    );
  }

  const parts = stored.split(":");
  if (parts.length !== 3) {
    throw new NoteCryptoError(
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
  } catch (cause) {
    throw new NoteCryptoError(
      "[note-crypto] Decryption failed: AES-GCM authentication rejected the envelope (tampered data, wrong key, or mismatched note ID)",
      { cause },
    );
  }
}
