/**
 * Schnorr (BIP-340) sign / verify over arbitrary byte strings.
 *
 * We hash the message to 32 bytes with SHA-256 before handing it to
 * @noble/curves so callers can pass anything (UTF-8 strings, JSON blobs,
 * raw buffers). This matches the NIP-01 event-id convention.
 */

import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

function toBytes(message) {
    if (message instanceof Uint8Array) return message;
    if (typeof message === 'string') return new TextEncoder().encode(message);
    throw new Error('message must be a string or Uint8Array');
}

/**
 * Sign a message with a hex-encoded private key. Returns a 64-byte Schnorr
 * signature as 128-char hex.
 */
export function signMessage(message, privateKeyHex) {
    const digest = sha256(toBytes(message));
    const sigBytes = schnorr.sign(digest, hexToBytes(privateKeyHex));
    return bytesToHex(sigBytes);
}

/**
 * Verify a Schnorr signature over a message.
 * @param {string|Uint8Array} message
 * @param {string} signatureHex 128 hex chars (64 bytes)
 * @param {string} publicKeyHex 64 hex chars (x-only)
 * @returns {boolean}
 */
export function verifyMessage(message, signatureHex, publicKeyHex) {
    try {
        const digest = sha256(toBytes(message));
        return schnorr.verify(hexToBytes(signatureHex), digest, hexToBytes(publicKeyHex));
    } catch {
        return false;
    }
}
