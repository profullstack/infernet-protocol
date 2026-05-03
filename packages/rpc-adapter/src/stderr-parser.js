/**
 * llama.cpp stderr parser — extracts the structured signals we need
 * to fill IPIP-0033 §5's `routing` event. llama-server logs in plain
 * text and the format drifts between releases, so this parser is
 * intentionally pattern-matching, not strict.
 *
 * Returns `null` for lines we don't understand — the caller (the
 * daemon) MAY still relay them as `log` SSE frames so operators can
 * see the raw output.
 *
 * Recognized event types:
 *
 *   { type: 'layer_assigned', layer, peer }
 *      `peer` is { kind: 'rpc', host, port } for an RPC slice
 *      and    { kind: 'local', device } for a local device.
 *
 *   { type: 'peer_connected', host, port }
 *   { type: 'peer_failed',    host, port, reason }
 *   { type: 'server_ready',   host, port }
 *   { type: 'load_progress',  percent }
 */

const RPC_TARGET_RE = /\bRPC\[\s*([^:\]\s]+)\s*:\s*(\d+)\s*\]/;
const LOCAL_TARGET_RE = /(?:assigned to|offloaded to|on)\s+(?:device\s+)?(CUDA\d+|CPU|Metal|Vulkan\d*|ROCm\d*)/i;
const LAYER_INDEX_RE = /\blayer\s*[#:]?\s*(\d+)\b/i;

const PEER_CONNECTED_RES = [
    /\bconnected to (?:rpc[- ]?server\s+)?([^:\s]+):(\d+)/i,
    /\brpc[- ]?server\s+([^:\s]+):(\d+)\s+is up/i
];

const PEER_FAILED_RES = [
    /\b(?:failed to connect to|rpc backend connect failed for)\s+([^:\s]+):(\d+)(?:\s*[:\-]\s*(.*))?/i,
    /\brpc[- ]?(?:server\s+)?([^:\s]+):(\d+)\s+(?:disconnected|dropped|lost)\s*[:\-]?\s*(.*)?/i
];

const SERVER_READY_RES = [
    // Modern llama-server form
    /\bserver is listening on https?:\/\/([^:/\s]+):(\d+)/i,
    // Older form
    /\bHTTP server listening at https?:\/\/([^:/\s]+):(\d+)/i,
    /\blistening on \[?([0-9a-fA-F:.]+)\]?:(\d+)/i
];

const LOAD_PROGRESS_RE = /\bload(?:ing)?[: ]\s*(\d+(?:\.\d+)?)\s*%/i;

/**
 * Parse a single stderr line into a structured event. Returns null
 * when the line doesn't match any known signal.
 *
 * @param {string} line
 * @returns {object | null}
 */
export function parseLlamaStderrLine(line) {
    if (typeof line !== 'string') return null;
    const trimmed = line.trim();
    if (!trimmed) return null;

    // Layer assignment is the load-bearing signal (used by IPIP-0033
    // §5 routing events). Check for it first so a noisier subsequent
    // pattern doesn't preempt it.
    const layerMatch = trimmed.match(LAYER_INDEX_RE);
    if (layerMatch) {
        const layer = Number.parseInt(layerMatch[1], 10);
        if (Number.isFinite(layer)) {
            const rpc = trimmed.match(RPC_TARGET_RE);
            if (rpc) {
                return {
                    type: 'layer_assigned',
                    layer,
                    peer: { kind: 'rpc', host: rpc[1], port: Number.parseInt(rpc[2], 10) }
                };
            }
            const local = trimmed.match(LOCAL_TARGET_RE);
            if (local) {
                return {
                    type: 'layer_assigned',
                    layer,
                    peer: { kind: 'local', device: local[1] }
                };
            }
        }
    }

    for (const re of PEER_FAILED_RES) {
        const m = trimmed.match(re);
        if (m) {
            return {
                type: 'peer_failed',
                host: m[1],
                port: Number.parseInt(m[2], 10),
                reason: (m[3] ?? '').trim() || null
            };
        }
    }

    for (const re of PEER_CONNECTED_RES) {
        const m = trimmed.match(re);
        if (m) {
            return {
                type: 'peer_connected',
                host: m[1],
                port: Number.parseInt(m[2], 10)
            };
        }
    }

    for (const re of SERVER_READY_RES) {
        const m = trimmed.match(re);
        if (m) {
            return {
                type: 'server_ready',
                host: m[1],
                port: Number.parseInt(m[2], 10)
            };
        }
    }

    const prog = trimmed.match(LOAD_PROGRESS_RE);
    if (prog) {
        return { type: 'load_progress', percent: Number.parseFloat(prog[1]) };
    }

    return null;
}

/**
 * Roll up a stream of stderr events into per-peer layer ranges +
 * lifecycle status. Drops `local` device assignments — the routing
 * event is the remote-RPC peer breakdown that the chat UI surfaces.
 * Gaps inside a single peer's range are tolerated (the IPIP routing
 * shape carries a single { start, end }).
 *
 * Status comes from the most recent lifecycle event for that
 * (host, port):
 *
 *   peer_connected → 'ok'
 *   layer_assigned → 'ok'   (implicitly — assignment means the slice is in use)
 *   peer_failed    → 'dropped' (with `reason` carried through)
 *
 * A peer that flaps (failed → connected → failed) ends in whichever
 * state the most recent event suggests.
 *
 * Returns an array shape compatible with IPIP-0033 §5:
 *
 *   [{ host, port, layers: { start, end }, count,
 *      status: 'ok' | 'dropped', reason? }, ...]
 *
 * Sorted by `layers.start` ascending.
 */
export function aggregateLayerAssignments(events) {
    const byPeer = new Map(); // "host:port" → { host, port, start, end, count, status, reason }

    for (const ev of events ?? []) {
        let key;
        let host;
        let port;
        if (ev?.type === 'layer_assigned' && ev.peer?.kind === 'rpc') {
            host = ev.peer.host;
            port = ev.peer.port;
        } else if (ev?.type === 'peer_failed' || ev?.type === 'peer_connected') {
            host = ev.host;
            port = ev.port;
        } else {
            continue;
        }
        key = `${host}:${port}`;

        const cur = byPeer.get(key);
        const base = cur ?? {
            host,
            port,
            start: null,
            end: null,
            count: 0,
            status: 'ok',
            reason: null
        };

        if (ev.type === 'layer_assigned') {
            base.start = base.start === null ? ev.layer : Math.min(base.start, ev.layer);
            base.end = base.end === null ? ev.layer : Math.max(base.end, ev.layer);
            base.count += 1;
            // A layer-assigned event always implies the peer is alive
            // RIGHT NOW; a stale 'dropped' status from earlier is
            // overwritten because llama.cpp wouldn't be assigning
            // layers to a peer it can't reach.
            base.status = 'ok';
            base.reason = null;
        } else if (ev.type === 'peer_failed') {
            base.status = 'dropped';
            if (typeof ev.reason === 'string' && ev.reason.length > 0) {
                base.reason = ev.reason;
            }
        } else if (ev.type === 'peer_connected') {
            base.status = 'ok';
            base.reason = null;
        }

        byPeer.set(key, base);
    }

    return [...byPeer.values()]
        // Drop peers we only saw a status event for and never had a
        // layer assigned to — they aren't routing-event peers.
        .filter((p) => p.start !== null)
        .sort((a, b) => a.start - b.start)
        .map((p) => ({
            host: p.host,
            port: p.port,
            layers: { start: p.start, end: p.end },
            count: p.count,
            status: p.status,
            ...(p.reason ? { reason: p.reason } : {})
        }));
}

export const __test__ = {
    RPC_TARGET_RE,
    LOCAL_TARGET_RE,
    LAYER_INDEX_RE
};
