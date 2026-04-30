/**
 * Server-side AES-256-GCM encryption for sensitive DB columns.
 *
 * Protects prompt/response content stored in Supabase. If Supabase
 * credentials are compromised, the attacker sees ciphertext only.
 *
 * Usage:
 *   encryptJSON(obj)   → { _enc: "<base64>" }  (or obj unchanged if no key)
 *   decryptJSON(obj)   → original object         (no-op if not encrypted)
 *
 * Set INFERNET_DB_ENCRYPTION_KEY to a 32-byte hex string (64 chars).
 * Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * If the key is absent, encryptJSON returns the object unchanged and
 * decryptJSON passes through unencrypted objects unchanged. This makes
 * encryption opt-in and backwards-compatible during rollout.
 *
 * If encrypted data is found in the DB but the key is missing, decryptJSON
 * throws — this is intentional to catch misconfiguration loudly.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey() {
    const hex = process.env.INFERNET_DB_ENCRYPTION_KEY;
    if (!hex) return null;
    const buf = Buffer.from(hex, "hex");
    if (buf.length !== 32) {
        throw new Error(
            "INFERNET_DB_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters). " +
            "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
        );
    }
    return buf;
}

/**
 * Encrypt a JSON-serialisable object.
 * Returns { _enc: "<base64>" } when the key is configured.
 * Returns the object unchanged when no key is set (plaintext mode).
 */
export function encryptJSON(obj) {
    const key = getKey();
    if (!key) return obj;

    const plain = JSON.stringify(obj);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGO, key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Wire format: iv(12 bytes) || auth-tag(16 bytes) || ciphertext — all packed as one base64 blob.
    const packed = Buffer.concat([iv, tag, encrypted]).toString("base64");
    return { _enc: packed };
}

/**
 * Decrypt a value previously produced by encryptJSON.
 * Returns the original object when the value has no _enc key (plaintext or null).
 * Throws when _enc is present but INFERNET_DB_ENCRYPTION_KEY is unset (misconfiguration).
 */
export function decryptJSON(obj) {
    if (obj == null || typeof obj !== "object" || !("_enc" in obj)) return obj;

    const key = getKey();
    if (!key) {
        throw new Error(
            "DB contains encrypted data but INFERNET_DB_ENCRYPTION_KEY is not set. " +
            "Set the key to the value that was used when the data was written."
        );
    }

    const buf = Buffer.from(obj._enc, "base64");
    const iv = buf.subarray(0, IV_BYTES);
    const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = buf.subarray(IV_BYTES + TAG_BYTES);

    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    return JSON.parse(plain);
}
