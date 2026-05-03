import { describe, expect, it } from 'vitest';
import {
    parseLlamaStderrLine,
    aggregateLayerAssignments
} from '../packages/rpc-adapter/src/stderr-parser.js';

describe('parseLlamaStderrLine — layer assignments', () => {
    it('extracts an RPC layer assignment with host:port', () => {
        const ev = parseLlamaStderrLine('load_tensors: layer  12 assigned to device RPC[1.2.3.4:50052]');
        expect(ev).toEqual({
            type: 'layer_assigned',
            layer: 12,
            peer: { kind: 'rpc', host: '1.2.3.4', port: 50052 }
        });
    });

    it('handles whitespace + alternate phrasing', () => {
        const ev = parseLlamaStderrLine('load_tensors: layer 31 offloaded to RPC[ peer-a.example : 50053 ]');
        expect(ev).toMatchObject({
            type: 'layer_assigned',
            layer: 31,
            peer: { kind: 'rpc', host: 'peer-a.example', port: 50053 }
        });
    });

    it('reports local devices without an RPC suffix', () => {
        const ev = parseLlamaStderrLine('load_tensors: layer 0 assigned to CUDA0');
        expect(ev).toEqual({
            type: 'layer_assigned',
            layer: 0,
            peer: { kind: 'local', device: 'CUDA0' }
        });
    });

    it('returns null when the layer line has no recognizable target', () => {
        expect(parseLlamaStderrLine('load_tensors: layer 5 weights only, no destination')).toBeNull();
    });
});

describe('parseLlamaStderrLine — peer lifecycle', () => {
    it('detects a new RPC peer connection', () => {
        const ev = parseLlamaStderrLine('rpc-server 10.0.0.7:50052 is up');
        expect(ev).toEqual({
            type: 'peer_connected',
            host: '10.0.0.7',
            port: 50052
        });
    });

    it('detects connect failures with a reason', () => {
        const ev = parseLlamaStderrLine('failed to connect to 10.0.0.7:50052: connection refused');
        expect(ev).toEqual({
            type: 'peer_failed',
            host: '10.0.0.7',
            port: 50052,
            reason: 'connection refused'
        });
    });

    it('detects mid-stream disconnects', () => {
        const ev = parseLlamaStderrLine('rpc-server 10.0.0.7:50052 disconnected: timeout');
        expect(ev).toMatchObject({
            type: 'peer_failed',
            host: '10.0.0.7',
            port: 50052
        });
    });
});

describe('parseLlamaStderrLine — server ready', () => {
    it('matches the modern llama-server listening line', () => {
        const ev = parseLlamaStderrLine('main: server is listening on http://127.0.0.1:8080 - starting the main loop');
        expect(ev).toEqual({ type: 'server_ready', host: '127.0.0.1', port: 8080 });
    });

    it('matches an alternate "HTTP server listening" log line', () => {
        const ev = parseLlamaStderrLine('HTTP server listening at http://0.0.0.0:9090');
        expect(ev).toEqual({ type: 'server_ready', host: '0.0.0.0', port: 9090 });
    });
});

describe('parseLlamaStderrLine — load progress', () => {
    it('extracts a percent value', () => {
        const ev = parseLlamaStderrLine('loading: 47% (...)');
        expect(ev).toEqual({ type: 'load_progress', percent: 47 });
    });
});

describe('parseLlamaStderrLine — defensive', () => {
    it('returns null for blank / non-string input', () => {
        expect(parseLlamaStderrLine('')).toBeNull();
        expect(parseLlamaStderrLine('   ')).toBeNull();
        expect(parseLlamaStderrLine(null)).toBeNull();
        expect(parseLlamaStderrLine(undefined)).toBeNull();
    });

    it('returns null for unrelated lines', () => {
        expect(parseLlamaStderrLine('llama_print_timings: load time =     1234.56 ms'))
            .toBeNull();
    });
});

describe('aggregateLayerAssignments — IPIP-0033 §5 routing shape', () => {
    it('rolls multiple layer events into one peer range, sorted by start', () => {
        const events = [
            { type: 'layer_assigned', layer: 12, peer: { kind: 'rpc', host: 'b', port: 50053 } },
            { type: 'layer_assigned', layer: 0,  peer: { kind: 'rpc', host: 'a', port: 50052 } },
            { type: 'layer_assigned', layer: 1,  peer: { kind: 'rpc', host: 'a', port: 50052 } },
            { type: 'layer_assigned', layer: 13, peer: { kind: 'rpc', host: 'b', port: 50053 } },
            { type: 'layer_assigned', layer: 99, peer: { kind: 'local', device: 'CUDA0' } }
        ];
        expect(aggregateLayerAssignments(events)).toEqual([
            { host: 'a', port: 50052, layers: { start: 0, end: 1 },   count: 2, status: 'ok' },
            { host: 'b', port: 50053, layers: { start: 12, end: 13 }, count: 2, status: 'ok' }
        ]);
    });

    it('drops local-device assignments — only RPC peers go in the routing event', () => {
        const events = [
            { type: 'layer_assigned', layer: 0, peer: { kind: 'local', device: 'CUDA0' } }
        ];
        expect(aggregateLayerAssignments(events)).toEqual([]);
    });

    it('handles non-array / null input gracefully', () => {
        expect(aggregateLayerAssignments(null)).toEqual([]);
        expect(aggregateLayerAssignments(undefined)).toEqual([]);
    });

    it('flips a peer to status:dropped after peer_failed, keeping its layer range', () => {
        const events = [
            { type: 'layer_assigned', layer: 0, peer: { kind: 'rpc', host: 'a', port: 50052 } },
            { type: 'layer_assigned', layer: 7, peer: { kind: 'rpc', host: 'a', port: 50052 } },
            { type: 'peer_failed', host: 'a', port: 50052, reason: 'connection refused' }
        ];
        expect(aggregateLayerAssignments(events)).toEqual([
            { host: 'a', port: 50052, layers: { start: 0, end: 7 }, count: 2, status: 'dropped', reason: 'connection refused' }
        ]);
    });

    it('a fresh layer_assigned after peer_failed restores status:ok (peer recovered)', () => {
        const events = [
            { type: 'layer_assigned', layer: 0, peer: { kind: 'rpc', host: 'a', port: 50052 } },
            { type: 'peer_failed', host: 'a', port: 50052, reason: 'timeout' },
            { type: 'layer_assigned', layer: 1, peer: { kind: 'rpc', host: 'a', port: 50052 } }
        ];
        const out = aggregateLayerAssignments(events);
        expect(out[0].status).toBe('ok');
        expect(out[0].reason).toBeUndefined();
    });

    it('peer_connected without a layer assignment is dropped from the routing peers list', () => {
        const events = [
            { type: 'peer_connected', host: 'a', port: 50052 }
        ];
        expect(aggregateLayerAssignments(events)).toEqual([]);
    });

    it('mixed peers — one ok with layers, one dropped with layers, one connected only', () => {
        const events = [
            { type: 'layer_assigned', layer: 0,  peer: { kind: 'rpc', host: 'ok',   port: 50052 } },
            { type: 'layer_assigned', layer: 1,  peer: { kind: 'rpc', host: 'ok',   port: 50052 } },
            { type: 'layer_assigned', layer: 8,  peer: { kind: 'rpc', host: 'gone', port: 50053 } },
            { type: 'layer_assigned', layer: 15, peer: { kind: 'rpc', host: 'gone', port: 50053 } },
            { type: 'peer_failed', host: 'gone', port: 50053, reason: 'rpc backend connect failed' },
            { type: 'peer_connected', host: 'lurker', port: 50054 }
        ];
        const out = aggregateLayerAssignments(events);
        expect(out).toHaveLength(2);
        expect(out[0]).toMatchObject({ host: 'ok', layers: { start: 0, end: 1 }, status: 'ok' });
        expect(out[1]).toMatchObject({ host: 'gone', layers: { start: 8, end: 15 }, status: 'dropped' });
        // No `lurker` row because we never assigned it any layers.
    });
});
