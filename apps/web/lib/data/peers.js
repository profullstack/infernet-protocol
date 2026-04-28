import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * IPIP-0006 phase 1 — list recently-heartbeat'd providers as a peer
 * seed for bootstrapping new nodes.
 *

 * Returns the minimum a fresh node needs to join the network plus a
 * coarse capability summary used by matchmaking:
 *   { pubkey, multiaddr, last_seen, served_models, gpu_model,
 *     gpu_count, cpu, interconnects }
 *
 * Public reads — does NOT include payout addresses, internal ids, or
 * any per-operator sensitive data. Per IPIP-0001's "minimized
 * telemetry" rule, all this surfaces is what providers themselves
 * already chose to advertise via their register/heartbeat payload.
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const LIVE_WINDOW_MIN = 10;

function buildMultiaddr(address, port) {
    if (!address || !Number.isFinite(port)) return null;
    // IPv6 addresses contain colons; libp2p multiaddr uses /ip6/ for them.
    const family = address.includes(":") && !address.includes(".") ? "ip6" : "ip4";
    return `/${family}/${address}/tcp/${port}`;
}

function extractServedModels(specs) {
    if (!specs || typeof specs !== "object") return [];
    const gpus = Array.isArray(specs.gpus) ? specs.gpus : [];
    const fromGpus = gpus.map((g) => g?.model).filter((m) => typeof m === "string");
    const fromTopLevel = Array.isArray(specs.served_models)
        ? specs.served_models.filter((m) => typeof m === "string")
        : [];
    return [...new Set([...fromTopLevel, ...fromGpus])];
}

function extractCpu(specs) {
    if (!specs || typeof specs !== "object" || !specs.cpu) return null;
    const c = specs.cpu;
    return {
        vendor: c.vendor ?? null,
        arch: c.arch ?? null,
        cores: Number.isFinite(c.cores) ? c.cores : null,
        groups: Number.isFinite(c.groups) ? c.groups : null,
        ram_gb: Number.isFinite(c.ram_gb) ? c.ram_gb : null
    };
}

function extractInterconnects(specs) {
    if (!specs || typeof specs !== "object" || !specs.interconnects) return null;
    const ic = specs.interconnects;
    return {
        nvlink: !!ic.nvlink?.available,
        xgmi: !!ic.xgmi?.available,
        infiniband: !!ic.infiniband?.available,
        efa: !!ic.efa?.available,
        rdma_capable: !!ic.rdma_capable
    };
}

/**
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<Array<{
 *   pubkey: string|null,
 *   multiaddr: string|null,
 *   last_seen: string|null,
 *   served_models: string[],
 *   gpu_model: string|null
 * }>>}
 */
export async function listOnlinePeers(opts = {}) {
    const requested = Number.isFinite(opts.limit) ? opts.limit : DEFAULT_LIMIT;
    const limit = Math.max(1, Math.min(MAX_LIMIT, requested));

    const supabase = getSupabaseServerClient();
    const liveAfter = new Date(Date.now() - LIVE_WINDOW_MIN * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from("providers")
        .select("public_key, address, port, gpu_model, specs, last_seen")
        .eq("status", "available")
        .gte("last_seen", liveAfter)
        .not("public_key", "is", null)
        .order("last_seen", { ascending: false })
        .limit(limit);

    if (error) throw error;

    return (data ?? []).map((row) => ({
        pubkey: row.public_key,
        multiaddr: buildMultiaddr(row.address, row.port),
        last_seen: row.last_seen,
        served_models: extractServedModels(row.specs),
        gpu_model: row.gpu_model ?? null,
        gpu_count: Array.isArray(row.specs?.gpus) ? row.specs.gpus.length : 0,
        cpu: extractCpu(row.specs),
        interconnects: extractInterconnects(row.specs)
    }));
}

export const __testables__ = {
    buildMultiaddr,
    extractServedModels,
    DEFAULT_LIMIT,
    MAX_LIMIT,
    LIVE_WINDOW_MIN
};
