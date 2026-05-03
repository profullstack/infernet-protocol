/**
 * IPIP-0032 §4 — signed peer handshake.
 *
 * Wire format (single line of UTF-8, terminated by `\n`):
 *
 *     INFERNET-HELLO\n
 *     <canonical JSON of HelloPayload, with sig field appended>\n
 *
 * Schnorr signature (BIP-340) covers the canonical JSON of every
 * field EXCEPT `sig`. The receiver MUST drop the connection on bad
 * signature, missing field, or stale `ts`.
 */
import { signMessage, verifyMessage } from '@infernetprotocol/auth';

const HELLO_PREFIX = 'INFERNET-HELLO';
const HANDSHAKE_VERSION = 1;
const MAX_SKEW_MS = 60_000;

/**
 * Build a signed handshake envelope.
 *
 * @param {Object} args
 * @param {string} args.privateKey   Hex (64 chars).
 * @param {string} args.publicKey    Hex (64 chars, x-only).
 * @param {string[]} args.topics     ["model:qwen2.5:7b", "class:B", ...]
 * @param {string|null} [args.address]  Advertised host[:port], null if private.
 * @param {string} [args.nonce]      base64url 16-byte (auto-generated when omitted)
 * @param {string} [args.ts]         ISO-8601 (auto-generated when omitted)
 * @returns {{ frame: string, payload: HelloPayload }}
 */
export function buildHandshake({
    privateKey,
    publicKey,
    topics,
    address = null,
    nonce,
    ts
}) {
    if (!isHex64(privateKey)) throw new Error('privateKey must be 64 hex chars');
    if (!isHex64(publicKey)) throw new Error('publicKey must be 64 hex chars');
    if (!Array.isArray(topics)) throw new Error('topics must be an array');
    if (address !== null && typeof address !== 'string') {
        throw new Error('address must be string or null');
    }

    const payload = {
        v: HANDSHAKE_VERSION,
        pubkey: publicKey.toLowerCase(),
        topics: topics.slice().sort(),
        address,
        ts: ts ?? new Date().toISOString(),
        nonce: nonce ?? randomNonce()
    };

    const sig = signMessage(canonicalJson(payload), privateKey);
    const signed = { ...payload, sig };
    return {
        frame: `${HELLO_PREFIX}\n${canonicalJson(signed)}\n`,
        payload: signed
    };
}

/**
 * Parse + verify a handshake frame.
 *
 * Returns the verified payload on success; throws otherwise. The
 * caller is responsible for replay-cache eviction (use `nonce`).
 *
 * @param {string} frame
 * @param {{ now?: () => number }} [opts]
 * @returns {HelloPayload}
 */
export function verifyHandshake(frame, opts = {}) {
    if (typeof frame !== 'string') throw new Error('frame must be a string');
    const trimmed = frame.replace(/\n$/, '');
    const newline = trimmed.indexOf('\n');
    if (newline < 0) throw new Error('malformed frame: missing JSON line');
    const prefix = trimmed.slice(0, newline);
    if (prefix !== HELLO_PREFIX) {
        throw new Error(`malformed frame: prefix is ${JSON.stringify(prefix)}`);
    }

    let signed;
    try {
        signed = JSON.parse(trimmed.slice(newline + 1));
    } catch (err) {
        throw new Error(`malformed frame: invalid JSON (${err?.message ?? err})`);
    }
    if (!signed || typeof signed !== 'object') throw new Error('payload must be an object');

    requireField(signed, 'v', 'number');
    requireField(signed, 'pubkey', 'string');
    requireField(signed, 'topics', 'array');
    requireField(signed, 'ts', 'string');
    requireField(signed, 'nonce', 'string');
    requireField(signed, 'sig', 'string');
    if (signed.address !== null && typeof signed.address !== 'string') {
        throw new Error('address must be string or null');
    }
    if (signed.v !== HANDSHAKE_VERSION) {
        throw new Error(`unsupported handshake version: ${signed.v}`);
    }
    if (!isHex64(signed.pubkey)) throw new Error('pubkey must be 64 hex chars');

    const now = opts.now ? opts.now() : Date.now();
    const skewMs = Math.abs(now - Date.parse(signed.ts));
    if (!Number.isFinite(skewMs) || skewMs > MAX_SKEW_MS) {
        throw new Error(`handshake timestamp out of window (skew=${skewMs}ms)`);
    }

    const { sig, ...payload } = signed;
    const ok = verifyMessage(canonicalJson(payload), sig, signed.pubkey);
    if (!ok) throw new Error('signature verification failed');

    return signed;
}

/**
 * Stable JSON serialization — keys sorted lexicographically, no
 * whitespace. Required so signer + verifier hash the same bytes.
 */
export function canonicalJson(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    const keys = Object.keys(value).sort();
    const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`);
    return `{${parts.join(',')}}`;
}

function isHex64(s) {
    return typeof s === 'string' && /^[0-9a-fA-F]{64}$/.test(s);
}

function requireField(obj, name, kind) {
    if (!(name in obj)) throw new Error(`missing field: ${name}`);
    const v = obj[name];
    if (kind === 'array') {
        if (!Array.isArray(v)) throw new Error(`field ${name} must be array`);
        return;
    }
    if (typeof v !== kind) throw new Error(`field ${name} must be ${kind}`);
}

function randomNonce() {
    const bytes = new Uint8Array(16);
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
        globalThis.crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    return base64url(bytes);
}

function base64url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
    return globalThis.btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const __test__ = { HELLO_PREFIX, HANDSHAKE_VERSION, MAX_SKEW_MS };
