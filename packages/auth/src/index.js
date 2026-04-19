/**
 * @infernetprotocol/auth — Nostr identity + signed-request primitives.
 *
 * - `keys` : secp256k1 / BIP-340 key generation + derivation.
 * - `sig`  : Schnorr sign / verify over arbitrary messages.
 * - `signed-request` : HTTP envelope that lets a node prove ownership of a
 *   Nostr pubkey on every request without sharing a DB credential.
 * - `nostr` : legacy browser-extension helpers (NIP-07). Kept for the web UI.
 */

export * from './keys.js';
export * from './sig.js';
export * from './signed-request.js';
export * from './nostr.js';
