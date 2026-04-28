/**
 * Local CPU + system inventory.
 *
 * Sister of detect.js — that one shells out for GPU info, this one
 * uses `node:os` for CPU + memory + platform. Pure-JS, no shell-out,
 * no privileges required.
 *
 * Keeps the privacy-minimization story intact: detection happens
 * client-side, the operator decides what to surface in a heartbeat /
 * register payload (the server-side sanitizer in apps/web drops
 * anything outside `{ vendor, vram_tier, model }` per GPU and zero
 * CPU info, per IPIP-0001).
 */

import os from "node:os";

/**
 * Return one entry per logical CPU group, collapsed by model.
 *
 * Most boxes have a single homogeneous CPU package, so the typical
 * result is a single-element array. Heterogeneous machines (Apple
 * Silicon with P+E cores; some servers with mixed sockets) get one
 * entry per distinct model string.
 */
export function detectCpus() {
    const cpus = os.cpus();
    if (!Array.isArray(cpus) || cpus.length === 0) {
        return [{
            vendor: null,
            model: null,
            arch: process.arch,
            speed_mhz: null,
            cores_total: 0,
            cores_per_group: 0
        }];
    }

    const groups = new Map();
    for (const c of cpus) {
        const key = `${c.model ?? "unknown"}|${c.speed ?? 0}`;
        if (!groups.has(key)) {
            groups.set(key, {
                vendor: vendorOfModel(c.model),
                model: c.model ?? "unknown",
                arch: process.arch,
                speed_mhz: c.speed ?? null,
                cores_total: 0,
                cores_per_group: 0
            });
        }
        const g = groups.get(key);
        g.cores_total += 1;
        g.cores_per_group += 1;
    }

    return [...groups.values()];
}

/**
 * Snapshot of host-level details that pair with the CPU list.
 * Useful for `infernet gpu` / `infernet doctor` output but never
 * sent in a heartbeat without operator opt-in.
 */
export function detectHost() {
    return {
        platform:    process.platform,
        arch:        process.arch,
        node_version: process.versions.node,
        hostname:    os.hostname(),
        cpu_count:   os.cpus().length,
        total_ram_mb: Math.round(os.totalmem() / (1024 * 1024)),
        free_ram_mb:  Math.round(os.freemem() / (1024 * 1024)),
        load_avg:    os.loadavg()
    };
}

function vendorOfModel(model) {
    if (!model || typeof model !== "string") return null;
    const m = model.toLowerCase();
    if (m.includes("intel")) return "intel";
    if (m.includes("amd") || m.includes("ryzen") || m.includes("epyc") || m.includes("threadripper")) return "amd";
    if (m.includes("apple") || /\bm[1-9]\b/.test(m)) return "apple";
    if (m.includes("graviton") || m.includes("aws")) return "aws";
    if (m.includes("ampere")) return "ampere";
    return null;
}

/**
 * One-line summary per CPU group, suitable for CLI output.
 */
export function formatCpuLine(cpu) {
    const ghz = cpu.speed_mhz ? `${(cpu.speed_mhz / 1000).toFixed(2)} GHz` : "?";
    const vendor = cpu.vendor ? `[${cpu.vendor}]` : "";
    return `${vendor} ${cpu.model} — ${cpu.cores_total} cores @ ${ghz}`.trim();
}

export const __testables__ = { vendorOfModel };
