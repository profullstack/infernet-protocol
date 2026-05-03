import { describe, expect, it } from 'vitest';
import { computeTopics, topicSetSignature } from '../apps/cli/lib/discovery-bridge.js';

const PUBKEY = 'a'.repeat(64);

describe('computeTopics — IPIP-0032 §3 namespaces', () => {
    it('always emits the node:<pubkey> topic when pubkey is valid', () => {
        const topics = computeTopics({ pubkey: PUBKEY });
        expect(topics).toContainEqual({ kind: 'node', value: PUBKEY });
    });

    it('lowercases the node pubkey', () => {
        const topics = computeTopics({ pubkey: 'A'.repeat(64) });
        expect(topics[0]).toEqual({ kind: 'node', value: 'a'.repeat(64) });
    });

    it('skips node: topic when pubkey is missing or malformed', () => {
        expect(computeTopics({ pubkey: 'short' }).find((t) => t.kind === 'node')).toBeUndefined();
        expect(computeTopics({}).find((t) => t.kind === 'node')).toBeUndefined();
    });

    it('emits one model: topic per servedModels entry', () => {
        const topics = computeTopics({
            pubkey: PUBKEY,
            servedModels: ['qwen2.5:7b', 'llama3:8b']
        });
        expect(topics).toContainEqual({ kind: 'model', value: 'qwen2.5:7b' });
        expect(topics).toContainEqual({ kind: 'model', value: 'llama3:8b' });
    });

    it('emits rpc: topics for every rpc_slice + rpc_primary model', () => {
        const topics = computeTopics({
            pubkey: PUBKEY,
            inferenceState: {
                rpc_slice:   { models: ['qwen2.5:72b'] },
                rpc_primary: { models: ['llama3:70b'] }
            }
        });
        expect(topics).toContainEqual({ kind: 'rpc', value: 'qwen2.5:72b' });
        expect(topics).toContainEqual({ kind: 'rpc', value: 'llama3:70b' });
    });

    it('dedupes the rpc: topic when the daemon is both slice + primary for the same model', () => {
        const topics = computeTopics({
            pubkey: PUBKEY,
            inferenceState: {
                rpc_slice:   { models: ['qwen2.5:72b'] },
                rpc_primary: { models: ['qwen2.5:72b'] }
            }
        });
        expect(topics.filter((t) => t.kind === 'rpc' && t.value === 'qwen2.5:72b')).toHaveLength(1);
    });

    it('emits class:B5 when any rpc role is active', () => {
        const sliced = computeTopics({
            pubkey: PUBKEY,
            role: 'provider',
            inferenceState: { rpc_slice: { models: ['x'] } }
        });
        expect(sliced).toContainEqual({ kind: 'class', value: 'B5' });
        // class:B should NOT also be present — B5 is a stricter claim.
        expect(sliced.find((t) => t.kind === 'class' && t.value === 'B')).toBeUndefined();
    });

    it('emits class:B for plain providers with no rpc role', () => {
        const topics = computeTopics({
            pubkey: PUBKEY,
            role: 'provider',
            servedModels: ['qwen2.5:7b']
        });
        expect(topics).toContainEqual({ kind: 'class', value: 'B' });
    });

    it('does not emit a class topic for non-providers', () => {
        const aggregator = computeTopics({ pubkey: PUBKEY, role: 'aggregator' });
        const client = computeTopics({ pubkey: PUBKEY, role: 'client' });
        expect(aggregator.find((t) => t.kind === 'class')).toBeUndefined();
        expect(client.find((t) => t.kind === 'class')).toBeUndefined();
    });

    it('drops empty / non-string model entries', () => {
        const topics = computeTopics({
            pubkey: PUBKEY,
            servedModels: ['', null, undefined, 'good'],
            inferenceState: { rpc_slice: { models: [42, '', 'rpc-good'] } }
        });
        expect(topics).toContainEqual({ kind: 'model', value: 'good' });
        expect(topics).toContainEqual({ kind: 'rpc', value: 'rpc-good' });
        expect(topics.filter((t) => t.value === '')).toEqual([]);
    });
});

describe('topicSetSignature', () => {
    it('produces the same string regardless of input order', () => {
        const a = [
            { kind: 'rpc', value: 'qwen2.5:72b' },
            { kind: 'node', value: 'a'.repeat(64) },
            { kind: 'class', value: 'B5' }
        ];
        const b = [
            { kind: 'class', value: 'B5' },
            { kind: 'rpc', value: 'qwen2.5:72b' },
            { kind: 'node', value: 'a'.repeat(64) }
        ];
        expect(topicSetSignature(a)).toBe(topicSetSignature(b));
    });

    it('changes when a topic is added', () => {
        const a = [{ kind: 'rpc', value: 'm1' }];
        const b = [{ kind: 'rpc', value: 'm1' }, { kind: 'rpc', value: 'm2' }];
        expect(topicSetSignature(a)).not.toBe(topicSetSignature(b));
    });
});
