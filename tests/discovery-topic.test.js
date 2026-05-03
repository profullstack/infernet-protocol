import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { topicKey, topicKeyHex, canonicalizeValue } from '../packages/discovery/src/topic.js';

function sha256Hex(s) {
    return createHash('sha256').update(s, 'utf8').digest('hex');
}

describe('topicKey — IPIP-0032 §2', () => {
    it('returns 32 bytes', () => {
        const key = topicKey('model', 'qwen2.5:7b');
        expect(key).toBeInstanceOf(Uint8Array);
        expect(key.length).toBe(32);
    });

    it('uses the v1-prefixed format under the hash', () => {
        const expected = sha256Hex('infernet:v1:model:qwen2.5:7b');
        expect(topicKeyHex('model', 'qwen2.5:7b')).toBe(expected);
    });

    it('NFC-normalizes + lowercases model values', () => {
        // Composed vs. decomposed Unicode should hash the same.
        const composed = topicKeyHex('model', 'café:7b');           // café = U+00E9
        const decomposed = topicKeyHex('model', 'café:7b');   // e + combining acute
        expect(composed).toBe(decomposed);
        // Casing canonicalized.
        expect(topicKeyHex('model', 'Qwen2.5:7B')).toBe(topicKeyHex('model', 'qwen2.5:7b'));
    });

    it('uppercases workload class values', () => {
        expect(topicKeyHex('class', 'b')).toBe(topicKeyHex('class', 'B'));
        expect(topicKeyHex('class', 'b5')).toBe(topicKeyHex('class', 'B5'));
    });

    it('rejects unknown classes', () => {
        expect(() => topicKey('class', 'Z')).toThrow(/unknown workload class/);
    });

    it('lowercases node pubkey values + rejects non-hex / wrong length', () => {
        const key = 'A'.repeat(64);
        expect(topicKeyHex('node', key)).toBe(topicKeyHex('node', 'a'.repeat(64)));
        expect(() => topicKey('node', 'short')).toThrow(/64-char hex/);
        expect(() => topicKey('node', 'g'.repeat(64))).toThrow(/64-char hex/);
    });

    it('rejects unknown topic kinds and empty values', () => {
        expect(() => topicKey('weather', 'sunny')).toThrow(/unknown topic kind/);
        expect(() => topicKey('model', '')).toThrow(/non-empty/);
    });
});

describe('canonicalizeValue', () => {
    it('matches the documented canonical forms', () => {
        expect(canonicalizeValue('model', 'Qwen2.5:7B')).toBe('qwen2.5:7b');
        expect(canonicalizeValue('class', 'b5')).toBe('B5');
        expect(canonicalizeValue('node', 'A'.repeat(64))).toBe('a'.repeat(64));
        expect(canonicalizeValue('petals', 'meta-llama/Llama-3-70B')).toBe('meta-llama/Llama-3-70B');
    });
});
