/**
 * IPIP-0032 Phase 3 — bridge between the long-running daemon and the
 * Hyperswarm DiscoveryNode in @infernetprotocol/discovery.
 *
 * Owns one DiscoveryNode for the daemon's lifetime. The set of joined
 * topics is derived from:
 *   - the daemon's pubkey               → node:<pubkey>
 *   - specs.served_models               → model:<id> (single-node serving)
 *   - state.rpc_slice.models            → rpc:<id>   (IPIP-0033 slice)
 *   - state.rpc_primary.models          → rpc:<id>   (IPIP-0033 primary)
 *   - active rpc role / fleet-class     → class:B    or class:B5
 *
 * Recomputed periodically so daemons that come online and start
 * serving a new model picked up the new topic without restart.
 *
 * Discovery is gated behind `--enable-dht` per the IPIP rollout —
 * this module is only constructed when the flag is present, so
 * Hyperswarm is never imported on legacy daemons.
 */

/**
 * Pure topic-set builder — exported for tests. Returns a deduped
 * array of `{ kind, value }` ready to hand to DiscoveryNode.setTopics.
 *
 * @param {Object} args
 * @param {string} args.pubkey                     64-char hex
 * @param {string[]} [args.servedModels]           specs.served_models
 * @param {Object} [args.inferenceState]           shape from lib/inference/state.js
 * @param {'provider'|'aggregator'|'client'} [args.role]
 */
export function computeTopics({ pubkey, servedModels = [], inferenceState = {}, role }) {
    const topics = [];

    if (typeof pubkey === 'string' && /^[0-9a-fA-F]{64}$/.test(pubkey)) {
        topics.push({ kind: 'node', value: pubkey.toLowerCase() });
    }

    for (const m of servedModels) {
        if (typeof m === 'string' && m.length > 0) {
            topics.push({ kind: 'model', value: m });
        }
    }

    const slice = inferenceState?.rpc_slice;
    const primary = inferenceState?.rpc_primary;
    const sliceModels = Array.isArray(slice?.models) ? slice.models : [];
    const primaryModels = Array.isArray(primary?.models) ? primary.models : [];
    for (const m of sliceModels) {
        if (typeof m === 'string' && m.length > 0) topics.push({ kind: 'rpc', value: m });
    }
    for (const m of primaryModels) {
        if (typeof m === 'string' && m.length > 0) topics.push({ kind: 'rpc', value: m });
    }

    // Workload class (per IPIP-0010): nodes running federated inference
    // are class:B5; otherwise default providers are class:B. Aggregators
    // and clients don't get a class topic — they're not job-takers.
    const hasRpc = sliceModels.length > 0 || primaryModels.length > 0;
    if (hasRpc) {
        topics.push({ kind: 'class', value: 'B5' });
    } else if (role === 'provider') {
        topics.push({ kind: 'class', value: 'B' });
    }

    // Dedupe — primary + slice for the same model collapse to one rpc:
    // entry; node: is unique by construction.
    const seen = new Set();
    return topics.filter((t) => {
        const k = `${t.kind}:${t.value}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

/**
 * Serialize the topic set into a stable string so we only call
 * setTopics() when the set actually changes (saves a DHT churn).
 */
export function topicSetSignature(topics) {
    return topics
        .map((t) => `${t.kind}:${t.value}`)
        .sort()
        .join(',');
}

/**
 * Spin up the DiscoveryNode and resync its topic set on every
 * `intervalMs` tick. Returns `{ stop }` for clean shutdown.
 *
 * The DiscoveryNode itself is loaded via dynamic import so legacy
 * daemons that don't pass --enable-dht never touch the hyperswarm
 * dep tree.
 */
export async function startDiscoveryBridge({
    config,
    getState,
    advertise = true,
    address = null,
    intervalMs = 30_000,
    onPeer = null,
    onHandshakeFailed = null
}) {
    const { createDiscoveryNode } = await import('@infernetprotocol/discovery');
    const pubkey = config?.node?.publicKey;
    const privateKey = config?.node?.privateKey;
    const role = config?.node?.role;
    if (!pubkey || !privateKey) {
        throw new Error('discovery-bridge: config.node.{publicKey,privateKey} required');
    }

    const initialState = getState();
    const initialTopics = computeTopics({
        pubkey,
        servedModels: initialState?.servedModels ?? [],
        inferenceState: initialState?.inferenceState ?? {},
        role
    });

    const node = await createDiscoveryNode({
        privateKey,
        publicKey: pubkey,
        advertise,
        address,
        topics: initialTopics
    });

    let lastSig = topicSetSignature(initialTopics);

    if (typeof onPeer === 'function') {
        node.on('peer', onPeer);
    }
    if (typeof onHandshakeFailed === 'function') {
        node.on('handshake-failed', onHandshakeFailed);
    }

    let stopped = false;
    const interval = setInterval(() => {
        if (stopped) return;
        try {
            const s = getState();
            const next = computeTopics({
                pubkey,
                servedModels: s?.servedModels ?? [],
                inferenceState: s?.inferenceState ?? {},
                role
            });
            const sig = topicSetSignature(next);
            if (sig !== lastSig) {
                node.setTopics(next);
                lastSig = sig;
            }
        } catch {
            // Diff failed — leave previous topics in place.
        }
    }, intervalMs);
    if (typeof interval.unref === 'function') interval.unref();

    return {
        node,
        get currentTopics() { return node.topics; },
        stop: async () => {
            stopped = true;
            clearInterval(interval);
            try { await node.destroy(); } catch { /* ignore */ }
        }
    };
}
