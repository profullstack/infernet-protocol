/**
 * Nostr identity helpers for the infernet CLI — thin re-export around
 * `@infernetprotocol/auth` so commands keep using the names they already
 * know. Keys are real BIP-340 Schnorr / secp256k1 pairs now.
 */

import {
    generateKeyPair,
    derivePublicKey,
    keyPairIsValid,
    isHex64
} from '@infernetprotocol/auth';

export function generateNostrKeyPair() {
    return generateKeyPair();
}

export { derivePublicKey, keyPairIsValid, isHex64 };
