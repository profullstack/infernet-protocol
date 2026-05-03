/**
 * Pure helpers for IPIP-0033's RPC primary/slice selection. Lives in
 * its own file so the unit tests can import it without pulling in
 * `server-only` or the Supabase client.
 */

const RPC_TRUST_RANK = { public: 0, verified: 1, trusted: 2, private: 3 };

/**
 * Trust-tier ladder check. `public` (or undefined) need is always
 * met; otherwise the candidate's tier rank must be >= the required
 * rank. Mirrors `meetsTrustTier` in lib/data/chat.js to keep the two
 * paths consistent.
 */
export function meetsRpcTier(have, need) {
    if (!need || need === 'public') return true;
    return (RPC_TRUST_RANK[have ?? 'public'] ?? 0) >= (RPC_TRUST_RANK[need] ?? 0);
}

/**
 * Filter a list of provider rows down to viable RPC slices for a
 * model. Drops `private` trust-tier rows, drops rows missing a
 * routable host:port, and applies the optional `minTrustTier`
 * floor.
 *
 * @param {Array<object>} rows         Provider rows from supabase.
 * @param {Object} opts
 * @param {string} [opts.minTrustTier]
 * @param {string} [opts.excludeProviderId] Skip this row (e.g. the primary).
 * @returns {Array<{ provider, host, port, pubkey }>}
 */
export function selectRpcSlices(rows, opts = {}) {
    const { minTrustTier, excludeProviderId } = opts;
    const out = [];
    for (const r of rows ?? []) {
        if ((r.trust_tier ?? 'public') === 'private') continue;
        if (excludeProviderId && r.id === excludeProviderId) continue;
        if (minTrustTier && !meetsRpcTier(r.trust_tier, minTrustTier)) continue;
        const rpc = r.specs?.rpc ?? {};
        const host = rpc.host ?? r.address ?? null;
        const port = Number.isFinite(rpc.port) ? rpc.port : null;
        if (!host || !port) continue;
        out.push({ provider: r, host, port, pubkey: r.public_key ?? null });
    }
    return out;
}

/**
 * Merge daemon-reported per-peer layer assignments (host/port + range
 * + status) with our own slice metadata (operator name, pubkey).
 * Returns the IPIP-0033 §5 routing-event peer shape.
 *
 * @param {Object} args
 * @param {Array<{host:string, port:number, layers?:object, status?:string}>} args.daemonPeers
 * @param {Array<object>} args.slices  Provider rows (with specs.rpc).
 */
export function mergeRpcRouting({ daemonPeers, slices }) {
    if (!Array.isArray(daemonPeers)) return [];
    const sliceByHostPort = new Map();
    for (const s of slices ?? []) {
        const rpc = s.specs?.rpc ?? {};
        const key = `${rpc.host ?? s.address}:${rpc.port}`;
        sliceByHostPort.set(key, s);
    }
    return daemonPeers.map((p) => {
        const slice = sliceByHostPort.get(`${p.host}:${p.port}`);
        return {
            host: p.host ?? null,
            port: p.port ?? null,
            pubkey: slice?.public_key ?? null,
            name: slice?.name ?? null,
            layers: p.layers ?? null,
            status: p.status ?? 'ok'
        };
    });
}

/**
 * IPIP-0033 §6 — split a CPR receipt across the primary + the
 * layer-contributing slices. Pure function so the wire-format and
 * the math are testable without touching the queue.
 *
 * Returns a list of `{ provider, share }` rows where `share` is the
 * fraction of the original payment_offer that goes to that
 * provider. The primary gets a `1 / (n_peers + 1)` orchestration
 * share; the rest is split among slices weighted by layer span.
 *
 * If `daemonPeers` is empty / unrecognized, the primary gets the
 * full share — matches the IPIP's "fall back to crediting the
 * proxy" behavior for older daemons.
 */
export function splitRpcReceiptShares({ primary, slices, daemonPeers }) {
    const knowsLayers = Array.isArray(daemonPeers) && daemonPeers.length > 0;
    if (!knowsLayers) {
        return [{ provider: primary, share: 1, role: 'primary' }];
    }
    const baseShare = 1 / (daemonPeers.length + 1);
    const sliceByHostPort = new Map();
    for (const s of slices ?? []) {
        const rpc = s.specs?.rpc ?? {};
        sliceByHostPort.set(`${rpc.host ?? s.address}:${rpc.port}`, s);
    }
    const totalLayers = daemonPeers.reduce(
        (a, p) => a + Math.max(0, (p?.layers?.end ?? 0) - (p?.layers?.start ?? 0)),
        0
    ) || 1;
    const remaining = 1 - baseShare;
    const out = [{ provider: primary, share: baseShare, role: 'primary' }];
    for (const peer of daemonPeers) {
        const span = Math.max(0, (peer?.layers?.end ?? 0) - (peer?.layers?.start ?? 0));
        if (span === 0) continue;
        const slice = sliceByHostPort.get(`${peer.host}:${peer.port}`);
        if (!slice?.public_key) continue;
        out.push({
            provider: slice,
            share: remaining * (span / totalLayers),
            role: 'slice'
        });
    }
    return out;
}
