import { describe, expect, it } from 'vitest';
import {
    meetsRpcTier,
    selectRpcSlices,
    mergeRpcRouting,
    splitRpcReceiptShares
} from '../apps/web/lib/data/rpc-routing.js';

describe('meetsRpcTier — IPIP-0033 §7', () => {
    it('treats absent or "public" need as always met', () => {
        expect(meetsRpcTier('public')).toBe(true);
        expect(meetsRpcTier('verified', 'public')).toBe(true);
        expect(meetsRpcTier(undefined)).toBe(true);
    });

    it('respects the public < verified < trusted < private rank ladder', () => {
        expect(meetsRpcTier('public', 'verified')).toBe(false);
        expect(meetsRpcTier('verified', 'verified')).toBe(true);
        expect(meetsRpcTier('trusted', 'verified')).toBe(true);
        expect(meetsRpcTier('verified', 'trusted')).toBe(false);
    });

    it('defaults missing tier to public', () => {
        expect(meetsRpcTier(undefined, 'verified')).toBe(false);
        expect(meetsRpcTier(null, 'public')).toBe(true);
    });
});

describe('selectRpcSlices — IPIP-0033 §3', () => {
    const rows = [
        // Healthy slice — public tier, full rpc.host:port
        {
            id: 'p1', public_key: 'a'.repeat(64), trust_tier: 'public',
            specs: { rpc: { host: '10.0.0.1', port: 50052, models: ['qwen2.5:7b'] } }
        },
        // Verified slice using providers.address as fallback host
        {
            id: 'p2', public_key: 'b'.repeat(64), trust_tier: 'verified',
            address: '10.0.0.2', specs: { rpc: { port: 50053, models: ['qwen2.5:7b'] } }
        },
        // Private tier — must be filtered out (IPIP-0026 §2.1)
        {
            id: 'p3', public_key: 'c'.repeat(64), trust_tier: 'private',
            specs: { rpc: { host: '10.0.0.3', port: 50054, models: ['qwen2.5:7b'] } }
        },
        // Missing port — not routable
        {
            id: 'p4', public_key: 'd'.repeat(64), trust_tier: 'public',
            specs: { rpc: { host: '10.0.0.4', models: ['qwen2.5:7b'] } }
        },
        // Missing host — not routable
        {
            id: 'p5', public_key: 'e'.repeat(64), trust_tier: 'public',
            specs: { rpc: { port: 50055, models: ['qwen2.5:7b'] } }
        }
    ];

    it('drops private-tier rows', () => {
        const out = selectRpcSlices(rows);
        expect(out.find((r) => r.provider.id === 'p3')).toBeUndefined();
    });

    it('drops rows missing host or port', () => {
        const out = selectRpcSlices(rows);
        expect(out.find((r) => r.provider.id === 'p4')).toBeUndefined();
        expect(out.find((r) => r.provider.id === 'p5')).toBeUndefined();
    });

    it('falls back to providers.address when specs.rpc.host is absent', () => {
        const out = selectRpcSlices(rows);
        const p2 = out.find((r) => r.provider.id === 'p2');
        expect(p2).toBeDefined();
        expect(p2.host).toBe('10.0.0.2');
        expect(p2.port).toBe(50053);
    });

    it('honors minTrustTier — verified excludes public', () => {
        const out = selectRpcSlices(rows, { minTrustTier: 'verified' });
        expect(out.map((r) => r.provider.id)).toEqual(['p2']);
    });

    it('excludes the primary id when asked', () => {
        const out = selectRpcSlices(rows, { excludeProviderId: 'p1' });
        expect(out.find((r) => r.provider.id === 'p1')).toBeUndefined();
    });

    it('handles empty / null input', () => {
        expect(selectRpcSlices([])).toEqual([]);
        expect(selectRpcSlices(null)).toEqual([]);
    });
});

describe('mergeRpcRouting — IPIP-0033 §5', () => {
    const slices = [
        {
            id: 'p1', name: 'tokyo-vps-1', public_key: 'a'.repeat(64),
            specs: { rpc: { host: '10.0.0.1', port: 50052 } }
        },
        {
            id: 'p2', name: null, public_key: 'b'.repeat(64),
            address: '10.0.0.2', specs: { rpc: { port: 50053 } }
        }
    ];

    it('attaches operator name + pubkey to each daemon-reported peer', () => {
        const out = mergeRpcRouting({
            daemonPeers: [
                { host: '10.0.0.1', port: 50052, layers: { start: 0, end: 15 } },
                { host: '10.0.0.2', port: 50053, layers: { start: 16, end: 31 }, status: 'ok' }
            ],
            slices
        });
        expect(out).toEqual([
            { host: '10.0.0.1', port: 50052, pubkey: 'a'.repeat(64), name: 'tokyo-vps-1', layers: { start: 0, end: 15 }, status: 'ok' },
            { host: '10.0.0.2', port: 50053, pubkey: 'b'.repeat(64), name: null, layers: { start: 16, end: 31 }, status: 'ok' }
        ]);
    });

    it('returns a peer entry even when we have no slice row for the host:port', () => {
        const out = mergeRpcRouting({
            daemonPeers: [{ host: '10.99.0.99', port: 50099, layers: { start: 0, end: 7 } }],
            slices
        });
        expect(out).toEqual([
            { host: '10.99.0.99', port: 50099, pubkey: null, name: null, layers: { start: 0, end: 7 }, status: 'ok' }
        ]);
    });

    it('returns [] for non-array input', () => {
        expect(mergeRpcRouting({ daemonPeers: null, slices })).toEqual([]);
    });
});

describe('splitRpcReceiptShares — IPIP-0033 §6', () => {
    const primary = { id: 'pri', public_key: 'p'.repeat(64) };
    const slices = [
        { id: 's1', public_key: '1'.repeat(64), specs: { rpc: { host: '10.0.0.1', port: 50052 } } },
        { id: 's2', public_key: '2'.repeat(64), specs: { rpc: { host: '10.0.0.2', port: 50053 } } }
    ];

    it('credits the primary 100% when no daemon layer report is available', () => {
        const shares = splitRpcReceiptShares({ primary, slices, daemonPeers: null });
        expect(shares).toEqual([{ provider: primary, share: 1, role: 'primary' }]);
    });

    it('splits 1/(n+1) to primary, layer-weighted remainder to slices', () => {
        const daemonPeers = [
            { host: '10.0.0.1', port: 50052, layers: { start: 0, end: 16 } },   // span 16
            { host: '10.0.0.2', port: 50053, layers: { start: 16, end: 32 } }   // span 16
        ];
        const shares = splitRpcReceiptShares({ primary, slices, daemonPeers });
        expect(shares).toHaveLength(3);
        expect(shares[0].role).toBe('primary');
        // n=2 → primary gets 1/3, slices share 2/3 evenly → each 1/3
        expect(shares[0].share).toBeCloseTo(1 / 3, 5);
        expect(shares[1].share).toBeCloseTo(1 / 3, 5);
        expect(shares[2].share).toBeCloseTo(1 / 3, 5);
        const total = shares.reduce((a, s) => a + s.share, 0);
        expect(total).toBeCloseTo(1, 5);
    });

    it('weights slice shares by layer span', () => {
        const daemonPeers = [
            { host: '10.0.0.1', port: 50052, layers: { start: 0, end: 24 } },   // span 24
            { host: '10.0.0.2', port: 50053, layers: { start: 24, end: 32 } }   // span 8
        ];
        const shares = splitRpcReceiptShares({ primary, slices, daemonPeers });
        // Primary gets 1/3; slices share 2/3 weighted 24:8 → 3:1
        const primaryShare = shares.find((s) => s.role === 'primary').share;
        const s1Share = shares.find((s) => s.provider.id === 's1').share;
        const s2Share = shares.find((s) => s.provider.id === 's2').share;
        expect(primaryShare).toBeCloseTo(1 / 3, 5);
        expect(s1Share).toBeCloseTo((2 / 3) * (24 / 32), 5);
        expect(s2Share).toBeCloseTo((2 / 3) * (8 / 32), 5);
    });

    it('drops zero-span peers', () => {
        const daemonPeers = [
            { host: '10.0.0.1', port: 50052, layers: { start: 0, end: 16 } },
            { host: '10.0.0.2', port: 50053, layers: { start: 5, end: 5 } } // empty
        ];
        const shares = splitRpcReceiptShares({ primary, slices, daemonPeers });
        // s2 dropped — only primary + s1 remain.
        expect(shares.map((s) => s.role)).toEqual(['primary', 'slice']);
        expect(shares.find((s) => s.provider.id === 's1').share).toBeCloseTo(2 / 3, 5);
    });

    it('drops peers we have no provider row for (unknown pubkey)', () => {
        const daemonPeers = [
            { host: '10.0.0.1', port: 50052, layers: { start: 0, end: 16 } },
            { host: '10.99.0.99', port: 50099, layers: { start: 16, end: 32 } } // no slice row
        ];
        const shares = splitRpcReceiptShares({ primary, slices, daemonPeers });
        expect(shares.find((s) => s.provider?.id === 's2')).toBeUndefined();
        // Unknown peer is dropped — primary + s1 remain. Note: this
        // means the receipt total is < 1.0; the IPIP §6 leaves that
        // tradeoff explicit (don't pay strangers we can't identify).
    });
});
