/**
 * IPIP-0006 phase 2 — CLI peers bootstrap.
 *
 * Pulls a seed list of recently-heartbeat'd providers from
 * <controlPlane>/api/peers, caches it locally so subsequent runs
 * survive a control-plane outage, and exposes a single
 * `bootstrapPeers()` helper the daemon calls on startup.
 *
 * Flow:
 *   1. Try each configured seed node in order.
 *   2. First success → save to cache, return.
 *   3. All fail → fall back to the cached list (if any).
 *   4. Still nothing → return [].
 *
 * Cache file: `~/.config/infernet/peers.json` (mode 0600 — same dir
 * as identity, same protections).
 *
 * Public reads only; no signing required for /api/peers.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { getConfigDir } from "./config.js";

const DEFAULT_FETCH_LIMIT = 20;
const FETCH_TIMEOUT_MS = 5000;

export function getPeersCachePath() {
    return path.join(getConfigDir(), "peers.json");
}

/**
 * Fetch peers from a single seed node. Returns the array of peer
 * objects, or throws on network / HTTP / parse failure.
 *
 * @param {string} seedNode  control-plane base URL
 * @param {{ limit?: number, fetchImpl?: typeof fetch }} [opts]
 */
export async function fetchPeers(seedNode, opts = {}) {
    if (!seedNode) throw new Error("fetchPeers: seedNode is required");
    const limit = Number.isFinite(opts.limit) ? opts.limit : DEFAULT_FETCH_LIMIT;
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    const url = new URL("/api/peers", seedNode);
    url.searchParams.set("limit", String(limit));

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let res;
    try {
        res = await fetchImpl(url, {
            method: "GET",
            headers: { accept: "application/json" },
            signal: ctrl.signal
        });
    } finally {
        clearTimeout(t);
    }
    if (!res.ok) {
        const err = new Error(`GET ${url} → HTTP ${res.status}`);
        err.status = res.status;
        throw err;
    }
    const body = await res.json();
    if (!body || !Array.isArray(body.data)) {
        throw new Error(`unexpected /api/peers response shape from ${seedNode}`);
    }
    return body.data;
}

/**
 * Read the cached peers file. Returns the array or null if no cache
 * exists / cache is unparseable.
 */
export async function loadCachedPeers() {
    const p = getPeersCachePath();
    try {
        const raw = await fs.readFile(p, "utf8");
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.peers)) return null;
        return parsed.peers;
    } catch (err) {
        if (err && err.code === "ENOENT") return null;
        return null;
    }
}

/**
 * Atomically write the peers cache. Sets mode 0600.
 */
export async function saveCachedPeers(peers) {
    const dir = getConfigDir();
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const p = getPeersCachePath();
    const tmp = `${p}.tmp`;
    const body = JSON.stringify({ saved_at: new Date().toISOString(), peers }, null, 2) + "\n";
    await fs.writeFile(tmp, body, { mode: 0o600 });
    await fs.rename(tmp, p);
    try { await fs.chmod(p, 0o600); } catch { /* best-effort */ }
    return p;
}

/**
 * Try each seed in order; return the first successful response and
 * cache it. Fall back to the local cache if every seed fails. Returns
 * `{ peers, source: 'fetch'|'cache'|'empty', seedNode? }`.
 *
 * @param {{ seedNodes: string[], limit?: number, fetchImpl?: typeof fetch }} opts
 */
export async function bootstrapPeers(opts = {}) {
    const seedNodes = Array.isArray(opts.seedNodes) ? opts.seedNodes : [];
    const errors = [];

    for (const seed of seedNodes) {
        try {
            const peers = await fetchPeers(seed, opts);
            await saveCachedPeers(peers).catch(() => null);
            return { peers, source: "fetch", seedNode: seed };
        } catch (err) {
            errors.push({ seedNode: seed, message: err?.message ?? String(err) });
        }
    }

    const cached = await loadCachedPeers();
    if (cached && cached.length > 0) {
        return { peers: cached, source: "cache", errors };
    }
    return { peers: [], source: "empty", errors };
}

export const __testables__ = {
    DEFAULT_FETCH_LIMIT,
    FETCH_TIMEOUT_MS
};
