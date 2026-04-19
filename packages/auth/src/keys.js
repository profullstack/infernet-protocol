/**
 * Nostr key helpers — real secp256k1 / BIP-340 derivation.
 *
 * Nostr (NIP-01) uses x-only Schnorr pubkeys over secp256k1: the private key
 * is 32 random bytes, the public key is the x-coordinate of `priv * G`
 * encoded as 32 bytes (64 hex chars). This module wraps @noble/curves so the
 * rest of the codebase can treat keys as 64-hex-char strings.
 */

import { schnorr } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils.js';

const HEX64 = /^[0-9a-fA-F]{64}$/;

export function isHex64(value) {
    return typeof value === 'string' && HEX64.test(value);
}

/**
 * Generate a fresh Nostr keypair.
 * @returns {{ publicKey: string, privateKey: string }} hex-encoded
 */
export function generateKeyPair() {
    const privBytes = randomBytes(32);
    const privateKey = bytesToHex(privBytes);
    const publicKey = bytesToHex(schnorr.getPublicKey(privBytes));
    return { publicKey, privateKey };
}

/**
 * Derive the x-only Schnorr pubkey for a given hex privkey.
 * @param {string} privateKey hex (64 chars)
 * @returns {string} hex (64 chars)
 */
export function derivePublicKey(privateKey) {
    if (!isHex64(privateKey)) {
        throw new Error('privateKey must be 64 hex characters');
    }
    return bytesToHex(schnorr.getPublicKey(hexToBytes(privateKey)));
}

/**
 * Check that a given (pubkey, privkey) pair is internally consistent —
 * i.e. the pubkey really is the Schnorr pubkey of the privkey.
 */
export function keyPairIsValid(publicKey, privateKey) {
    if (!isHex64(publicKey) || !isHex64(privateKey)) return false;
    try {
        return derivePublicKey(privateKey) === publicKey.toLowerCase();
    } catch {
        return false;
    }
}
