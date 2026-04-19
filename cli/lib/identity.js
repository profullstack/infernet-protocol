/**
 * Nostr identity helpers for the infernet CLI.
 *
 * NOTE: This is a placeholder. A real Nostr identity requires proper secp256k1
 * public-key derivation from the private key. We avoid adding a dependency on
 * `nostr-tools` / `@noble/curves` at this stage and simply emit two random
 * 32-byte hex strings so the rest of the CLI has something to store.
 *
 * TODO: proper secp256k1 derivation once nostr-tools is added.
 */

import crypto from 'node:crypto';

/**
 * Generate a placeholder Nostr-style keypair.
 * @returns {{ publicKey: string, privateKey: string }}
 */
export function generateNostrKeyPair() {
    const privateKey = crypto.randomBytes(32).toString('hex');
    // TODO: proper secp256k1 derivation once nostr-tools is added
    const publicKey = crypto.randomBytes(32).toString('hex');
    return { publicKey, privateKey };
}

/**
 * Cheap hex-string validator for a 64-char (32-byte) hex key.
 * @param {string} value
 */
export function isHex64(value) {
    return typeof value === 'string' && /^[0-9a-fA-F]{64}$/.test(value);
}
