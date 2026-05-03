/**
 * IPIP-0032 §2-3 — topic key derivation.
 *
 * topic = sha256("infernet:v1:" + kind + ":" + value)
 *
 * Always 32 bytes. The "v1" segment lets a future IPIP rotate the
 * topic space without colliding with active swarms.
 */
import { sha256 } from '@noble/hashes/sha2.js';

const PREFIX = 'infernet:v1:';

const VALID_KINDS = new Set(['model', 'class', 'node', 'petals']);
const VALID_CLASSES = new Set(['A', 'B', 'B5', 'C']);

/**
 * Derive the 32-byte topic key for a (kind, value) pair.
 *
 * @param {'model'|'class'|'node'|'petals'} kind
 * @param {string} value Canonical, namespace-specific identifier.
 * @returns {Uint8Array} 32-byte topic key
 */
export function topicKey(kind, value) {
    if (!VALID_KINDS.has(kind)) {
        throw new Error(`unknown topic kind: ${kind}`);
    }
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`topic value must be a non-empty string`);
    }
    const canonical = canonicalizeValue(kind, value);
    const input = new TextEncoder().encode(`${PREFIX}${kind}:${canonical}`);
    return sha256(input);
}

/**
 * Hex-encoded topic key. Useful for logs, persistence, and the
 * `dht_topics` field on /api/peers.
 */
export function topicKeyHex(kind, value) {
    return bytesToHex(topicKey(kind, value));
}

/**
 * Canonicalize the value half of a topic.
 *
 * - model: NFC-normalized, lowercased
 * - class: uppercase enum (A | B | B5 | C); throws otherwise
 * - node:  64-char lowercase hex (x-only pubkey); throws otherwise
 * - petals: passed through (Petals model ids are case-sensitive)
 */
export function canonicalizeValue(kind, value) {
    switch (kind) {
        case 'model':
            return value.normalize('NFC').toLowerCase();
        case 'class': {
            const upper = value.toUpperCase();
            if (!VALID_CLASSES.has(upper)) {
                throw new Error(`unknown workload class: ${value}`);
            }
            return upper;
        }
        case 'node': {
            if (!/^[0-9a-f]{64}$/i.test(value)) {
                throw new Error(`node value must be 64-char hex pubkey`);
            }
            return value.toLowerCase();
        }
        case 'petals':
            return value;
        default:
            throw new Error(`unknown topic kind: ${kind}`);
    }
}

function bytesToHex(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) {
        out += bytes[i].toString(16).padStart(2, '0');
    }
    return out;
}

export const __test__ = { PREFIX };
