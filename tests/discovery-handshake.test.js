import { describe, expect, it } from 'vitest';
import { generateKeyPair } from '@infernetprotocol/auth';
import { buildHandshake, verifyHandshake, canonicalJson } from '../packages/discovery/src/handshake.js';

const TOPICS = ['class:B', 'model:qwen2.5:7b'];

describe('buildHandshake / verifyHandshake — IPIP-0032 §4', () => {
    it('round-trips: built frame verifies cleanly', () => {
        const keys = generateKeyPair();
        const { frame } = buildHandshake({
            privateKey: keys.privateKey,
            publicKey: keys.publicKey,
            topics: TOPICS,
            address: '203.0.113.7:46337'
        });
        const verified = verifyHandshake(frame);
        expect(verified.pubkey).toBe(keys.publicKey.toLowerCase());
        expect(verified.topics).toEqual([...TOPICS].sort());
        expect(verified.address).toBe('203.0.113.7:46337');
        expect(verified.v).toBe(1);
    });

    it('omits address when the operator is in private mode', () => {
        const keys = generateKeyPair();
        const { frame, payload } = buildHandshake({
            privateKey: keys.privateKey,
            publicKey: keys.publicKey,
            topics: TOPICS,
            address: null
        });
        expect(payload.address).toBeNull();
        const verified = verifyHandshake(frame);
        expect(verified.address).toBeNull();
    });

    it('rejects a tampered topic list (sig no longer covers the bytes)', () => {
        const keys = generateKeyPair();
        const { frame } = buildHandshake({
            privateKey: keys.privateKey,
            publicKey: keys.publicKey,
            topics: TOPICS
        });
        // Flip a character in the JSON line — keep the prefix intact.
        const tampered = frame.replace('class:B', 'class:C');
        expect(() => verifyHandshake(tampered)).toThrow(/signature verification failed/);
    });

    it('rejects a tampered pubkey field', () => {
        const keys = generateKeyPair();
        const other = generateKeyPair();
        const { payload } = buildHandshake({
            privateKey: keys.privateKey,
            publicKey: keys.publicKey,
            topics: TOPICS
        });
        // Build a frame that swaps in a different pubkey but keeps the
        // sig — the verifier MUST reject because the sig was over the
        // original pubkey bytes.
        const evil = { ...payload, pubkey: other.publicKey.toLowerCase() };
        const frame = `INFERNET-HELLO\n${canonicalJson(evil)}\n`;
        expect(() => verifyHandshake(frame)).toThrow(/signature verification failed/);
    });

    it('rejects a stale timestamp (>60s skew)', () => {
        const keys = generateKeyPair();
        const stale = new Date(Date.now() - 10 * 60_000).toISOString();
        const { frame } = buildHandshake({
            privateKey: keys.privateKey,
            publicKey: keys.publicKey,
            topics: TOPICS,
            ts: stale
        });
        expect(() => verifyHandshake(frame)).toThrow(/out of window/);
    });

    it('accepts when the verifier overrides "now" to match the build time', () => {
        const keys = generateKeyPair();
        const ts = new Date('2026-01-01T00:00:00Z').toISOString();
        const { frame } = buildHandshake({
            privateKey: keys.privateKey,
            publicKey: keys.publicKey,
            topics: TOPICS,
            ts
        });
        const verified = verifyHandshake(frame, { now: () => Date.parse(ts) + 1000 });
        expect(verified.ts).toBe(ts);
    });

    it('rejects malformed frames', () => {
        expect(() => verifyHandshake('garbage')).toThrow(/missing JSON line/);
        expect(() => verifyHandshake('NOT-INFERNET\n{}')).toThrow(/prefix/);
        expect(() => verifyHandshake('INFERNET-HELLO\n{not json')).toThrow(/invalid JSON/);
    });

    it('rejects payloads missing required fields', () => {
        const keys = generateKeyPair();
        const { payload } = buildHandshake({
            privateKey: keys.privateKey,
            publicKey: keys.publicKey,
            topics: TOPICS
        });
        const broken = { ...payload };
        delete broken.nonce;
        const frame = `INFERNET-HELLO\n${canonicalJson(broken)}\n`;
        expect(() => verifyHandshake(frame)).toThrow(/missing field: nonce/);
    });

    it('rejects unknown handshake version', () => {
        const keys = generateKeyPair();
        const { payload } = buildHandshake({
            privateKey: keys.privateKey,
            publicKey: keys.publicKey,
            topics: TOPICS
        });
        const frame = `INFERNET-HELLO\n${canonicalJson({ ...payload, v: 99 })}\n`;
        expect(() => verifyHandshake(frame)).toThrow(/unsupported handshake version/);
    });
});

describe('canonicalJson', () => {
    it('produces stable byte-for-byte output regardless of insertion order', () => {
        const a = canonicalJson({ b: 1, a: 2, c: [3, { y: 4, x: 5 }] });
        const b = canonicalJson({ c: [3, { x: 5, y: 4 }], a: 2, b: 1 });
        expect(a).toBe(b);
    });
});
