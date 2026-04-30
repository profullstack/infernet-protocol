/**
 * NIP-44 v2 — ECDH key agreement + ChaCha20 + HMAC-SHA256.
 *
 * Spec: https://github.com/nostr-protocol/nips/blob/master/44.md
 *
 * Key derivation:
 *   shared_x        = secp256k1.getSharedSecret(privA, compressedPubB)[1:33]
 *   conversation_key = HKDF-SHA256(ikm=shared_x, salt=utf8("nip44-v2"), info="", len=32)
 *
 * Per-message encrypt(conversationKey, plaintext):
 *   nonce        = random 32 bytes
 *   message_keys = HKDF-SHA256(ikm=conversationKey, salt=nonce, info=utf8("encryption"), len=76)
 *   chacha_key   = message_keys[0:32]
 *   chacha_nonce = message_keys[32:44]
 *   hmac_key     = message_keys[44:76]
 *   ciphertext   = ChaCha20(plaintext, chacha_key, chacha_nonce)
 *   mac          = HMAC-SHA256(hmac_key, nonce || ciphertext)
 *   payload      = base64(version(1 byte=2) || nonce || ciphertext || mac)
 *
 * Works in both Node.js and modern browsers.
 */

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { chacha20 } from "@noble/ciphers/chacha.js";

const VERSION = 2;
const NONCE_BYTES = 32;
const MAC_BYTES = 32;

/**
 * Derive a conversation key from one side's privkey + other side's pubkey.
 * Both are 64-hex Nostr / BIP-340 x-only keys.
 */
export function getConversationKey(privkeyHex, pubkeyHex) {
    const privBytes = _hex(privkeyHex);
    const pubBytes = _toCompressed(pubkeyHex);
    const shared = secp256k1.getSharedSecret(privBytes, pubBytes);
    const sharedX = shared.slice(1, 33); // x-coordinate only
    return hkdf(sha256, sharedX, _utf8("nip44-v2"), new Uint8Array(0), 32);
}

/** Encrypt plaintext string → base64 payload. */
export function encrypt(conversationKey, plaintext) {
    const nonce = randomBytes(NONCE_BYTES);
    const { chachaKey, chachaNonce, hmacKey } = _messageKeys(conversationKey, nonce);

    const plain = _utf8(plaintext);
    const ciphertext = chacha20(chachaKey, chachaNonce, plain);
    const mac = hmac(sha256, hmacKey, _concat(nonce, ciphertext));

    return _toBase64(_concat(new Uint8Array([VERSION]), nonce, ciphertext, mac));
}

/** Decrypt base64 payload → plaintext string. Throws on MAC failure. */
export function decrypt(conversationKey, payloadBase64) {
    const payload = _fromBase64(payloadBase64);
    if (payload[0] !== VERSION) throw new Error(`nip44: unsupported version ${payload[0]}`);

    const nonce = payload.slice(1, 1 + NONCE_BYTES);
    const mac = payload.slice(payload.length - MAC_BYTES);
    const ciphertext = payload.slice(1 + NONCE_BYTES, payload.length - MAC_BYTES);

    if (ciphertext.length === 0) throw new Error("nip44: empty ciphertext");

    const { chachaKey, chachaNonce, hmacKey } = _messageKeys(conversationKey, nonce);
    const expectedMac = hmac(sha256, hmacKey, _concat(nonce, ciphertext));

    if (!_timingSafeEqual(expectedMac, mac)) throw new Error("nip44: authentication failed");

    const plain = chacha20(chachaKey, chachaNonce, ciphertext);
    return new TextDecoder().decode(plain);
}

// ─── internal ────────────────────────────────────────────────────────────────

function _messageKeys(conversationKey, nonce) {
    const keys = hkdf(sha256, conversationKey, nonce, _utf8("encryption"), 76);
    return {
        chachaKey: keys.slice(0, 32),
        chachaNonce: keys.slice(32, 44),
        hmacKey: keys.slice(44, 76)
    };
}

function _utf8(str) { return new TextEncoder().encode(str); }

function _hex(hex) {
    const b = new Uint8Array(hex.length / 2);
    for (let i = 0; i < b.length; i++) b[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return b;
}

function _concat(...arrays) {
    const n = arrays.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(n);
    let off = 0;
    for (const a of arrays) { out.set(a, off); off += a.length; }
    return out;
}

function _toBase64(bytes) {
    if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
    return btoa(String.fromCharCode(...bytes));
}

function _fromBase64(b64) {
    if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function _timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
    return d === 0;
}

/**
 * Nostr BIP-340 x-only pubkeys (32 bytes / 64 hex) need a 0x02 prefix
 * to be passed to secp256k1.getSharedSecret as a compressed point.
 */
function _toCompressed(pubkeyHex) {
    if (pubkeyHex.length === 64) return _hex("02" + pubkeyHex);
    if (pubkeyHex.length === 66) return _hex(pubkeyHex);
    throw new Error("nip44: pubkey must be 32 or 33 bytes hex");
}
