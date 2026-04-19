/**
 * Signed HTTP request envelope — lets a node prove ownership of a Nostr
 * pubkey without ever handing a DB credential to the control plane.
 *
 * Protocol:
 *   - The client computes a canonical string:
 *       `${method}\n${path}\n${created_at}\n${nonce}\n${sha256_hex(body)}`
 *   - Signs it with Schnorr (BIP-340) using the node's 32-byte Nostr privkey.
 *   - Attaches an `X-Infernet-Auth` header with base64url-encoded JSON:
 *       { v, pubkey, created_at, nonce, sig }
 *
 * The server verifies:
 *   1. `v === 1`
 *   2. `created_at` is within +/- REPLAY_WINDOW_SECONDS of now
 *   3. `nonce` has not been seen before (caller-provided replay cache)
 *   4. signature is valid for (method, path, created_at, nonce, sha256(body))
 *   5. `pubkey` is authorized for the target resource (caller check)
 *
 * `path` must be the request path + query (e.g. `/api/v1/node/heartbeat`),
 * not the full URL, so proxies rewriting hostnames don't break the sig.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils.js';

import { signMessage, verifyMessage } from './sig.js';
import { isHex64 } from './keys.js';

export const AUTH_HEADER = 'x-infernet-auth';
export const ENVELOPE_VERSION = 1;
export const REPLAY_WINDOW_SECONDS = 60;

function utf8(value) {
    return new TextEncoder().encode(value);
}

function sha256Hex(bytes) {
    return bytesToHex(sha256(bytes));
}

function canonicalString({ method, path, createdAt, nonce, bodyHashHex }) {
    return `${method.toUpperCase()}\n${path}\n${createdAt}\n${nonce}\n${bodyHashHex}`;
}

function base64urlEncode(bytes) {
    return Buffer.from(bytes).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
    const pad = '='.repeat((4 - (str.length % 4)) % 4);
    const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
    return new Uint8Array(Buffer.from(b64, 'base64'));
}

/**
 * Create a signed-request header + body-hash pair. Returns { header, bodyHashHex }.
 *
 * @param {Object} opts
 * @param {string} opts.method - HTTP method
 * @param {string} opts.path   - request path + query string
 * @param {string} opts.body   - request body as a string (use '' for GET)
 * @param {string} opts.privateKey - 64-char hex Nostr privkey
 * @param {string} opts.publicKey  - 64-char hex Nostr pubkey (x-only)
 */
export function signRequest({ method, path, body, privateKey, publicKey }) {
    if (!isHex64(privateKey) || !isHex64(publicKey)) {
        throw new Error('privateKey and publicKey must be 64 hex characters');
    }
    const createdAt = Math.floor(Date.now() / 1000);
    const nonce = bytesToHex(randomBytes(16));
    const bodyBytes = typeof body === 'string' ? utf8(body) : (body ?? new Uint8Array(0));
    const bodyHashHex = sha256Hex(bodyBytes);

    const canonical = canonicalString({ method, path, createdAt, nonce, bodyHashHex });
    const sig = signMessage(canonical, privateKey);

    const envelope = {
        v: ENVELOPE_VERSION,
        pubkey: publicKey.toLowerCase(),
        created_at: createdAt,
        nonce,
        sig
    };
    const header = base64urlEncode(utf8(JSON.stringify(envelope)));
    return { header, bodyHashHex };
}

/**
 * Parse the X-Infernet-Auth header. Throws on structural problems.
 */
export function parseAuthHeader(headerValue) {
    if (!headerValue || typeof headerValue !== 'string') {
        throw new Error('missing X-Infernet-Auth header');
    }
    let json;
    try {
        json = JSON.parse(Buffer.from(base64urlDecode(headerValue)).toString('utf8'));
    } catch (err) {
        throw new Error(`invalid X-Infernet-Auth envelope: ${err?.message ?? err}`);
    }
    if (json?.v !== ENVELOPE_VERSION) {
        throw new Error(`unsupported envelope version: ${json?.v}`);
    }
    if (!isHex64(json.pubkey)) {
        throw new Error('envelope pubkey must be 64 hex chars');
    }
    if (typeof json.created_at !== 'number') {
        throw new Error('envelope created_at must be a number');
    }
    if (typeof json.nonce !== 'string' || json.nonce.length === 0) {
        throw new Error('envelope nonce must be a non-empty string');
    }
    if (typeof json.sig !== 'string' || json.sig.length !== 128) {
        throw new Error('envelope sig must be a 128-char hex string');
    }
    return json;
}

/**
 * Verify a signed request. Returns { ok: true, pubkey } on success or
 * { ok: false, error } on failure.
 *
 * The caller is responsible for:
 *   - de-duplicating `nonce` values (replay cache)
 *   - authorizing `pubkey` against the target resource
 *
 * @param {Object} opts
 * @param {string} opts.method
 * @param {string} opts.path
 * @param {string|Uint8Array} opts.body - exact bytes the client sent
 * @param {string} opts.headerValue - value of X-Infernet-Auth
 * @param {number} [opts.now] - override current time (seconds) for tests
 */
export function verifySignedRequest({ method, path, body, headerValue, now }) {
    let env;
    try {
        env = parseAuthHeader(headerValue);
    } catch (err) {
        return { ok: false, error: err.message };
    }

    const nowSec = Number.isFinite(now) ? now : Math.floor(Date.now() / 1000);
    const skew = Math.abs(nowSec - env.created_at);
    if (skew > REPLAY_WINDOW_SECONDS) {
        return { ok: false, error: `timestamp outside replay window (skew=${skew}s)` };
    }

    const bodyBytes = typeof body === 'string'
        ? utf8(body)
        : (body instanceof Uint8Array ? body : new Uint8Array(0));
    const bodyHashHex = sha256Hex(bodyBytes);

    const canonical = canonicalString({
        method,
        path,
        createdAt: env.created_at,
        nonce: env.nonce,
        bodyHashHex
    });

    if (!verifyMessage(canonical, env.sig, env.pubkey)) {
        return { ok: false, error: 'signature verification failed' };
    }
    return { ok: true, pubkey: env.pubkey, nonce: env.nonce, createdAt: env.created_at };
}

/**
 * In-memory replay cache — LRU-ish Map keyed by nonce with a hard ceiling.
 * For serverless/Next.js this is per-process; behind a load balancer you'd
 * want to swap this for Redis / Supabase. Good enough for Phase 1.
 */
export class ReplayCache {
    constructor({ max = 10_000, ttlSeconds = REPLAY_WINDOW_SECONDS * 2 } = {}) {
        this.max = max;
        this.ttlMs = ttlSeconds * 1000;
        this.seen = new Map();
    }
    has(nonce) {
        const expiresAt = this.seen.get(nonce);
        if (!expiresAt) return false;
        if (expiresAt < Date.now()) {
            this.seen.delete(nonce);
            return false;
        }
        return true;
    }
    add(nonce) {
        if (this.seen.size >= this.max) {
            const firstKey = this.seen.keys().next().value;
            if (firstKey) this.seen.delete(firstKey);
        }
        this.seen.set(nonce, Date.now() + this.ttlMs);
    }
}
