/**
 * Interconnect detection — NVLink between GPUs, InfiniBand fabric.
 *
 * Both matter for distributed work:
 *   - NVLink lets Ollama / vLLM / DeepSpeed do tensor-parallel inference
 *     across multiple GPUs on the same host without going through PCIe.
 *   - InfiniBand (or RoCE) is what NCCL/RCCL uses to do all-reduce
 *     across hosts during distributed training. Without IB, multi-node
 *     training falls back to TCP and slows down by 10-100×.
 *
 * Returned shape (always defined, even when nothing is detected):
 *
 *   {
 *     nvlink: {
 *       available: boolean,
 *       topology: 'all-to-all' | 'mesh' | 'pair' | 'none' | 'unknown',
 *       links: [{ from: number, to: number, kind: 'NV1'..'NV12' }],
 *       raw_topo?: string   // nvidia-smi topo -m output for debugging
 *     },
 *     infiniband: {
 *       available: boolean,
 *       devices: [{ name, board_id, port, state, rate, link_layer }]
 *     },
 *     rdma_capable: boolean
 *   }
 *
 * Detection is best-effort — any command that's missing or fails is
 * silently skipped. Same contract as detectGpus().
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const pExecFile = promisify(execFile);
const EXEC_TIMEOUT_MS = 4000;

async function tryExec(bin, args) {
    try {
        const { stdout } = await pExecFile(bin, args, { timeout: EXEC_TIMEOUT_MS });
        return stdout;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// NVLink — `nvidia-smi topo -m`
//
// Output looks like:
//          GPU0   GPU1   GPU2   GPU3   CPU Affinity
//   GPU0    X    NV2    NV2    NV2    0-15
//   GPU1   NV2    X     NV2    NV2    0-15
//   ...
// where NV<n> means "n NVLink hops" and SYS / PHB / NODE mean PCIe.
// ---------------------------------------------------------------------------
async function detectNvlink() {
    const empty = { available: false, topology: 'none', links: [] };

    const out = await tryExec('nvidia-smi', ['topo', '-m']);
    if (!out) return empty;

    const links = parseNvidiaTopo(out);
    if (links.length === 0) {
        return { ...empty, raw_topo: out.length < 4096 ? out : undefined };
    }

    // Topology classification:
    //   all-to-all: every distinct GPU pair has at least one NVLink
    //   mesh: most pairs but not all
    //   pair: only certain pairs (typical 2-GPU NVLink bridge)
    const gpuIds = new Set();
    for (const l of links) {
        gpuIds.add(l.from);
        gpuIds.add(l.to);
    }
    const n = gpuIds.size;
    const expectedAllToAll = n >= 2 ? (n * (n - 1)) / 2 : 0;
    let topology = 'unknown';
    if (n === 2) topology = 'pair';
    else if (n > 2 && links.length >= expectedAllToAll) topology = 'all-to-all';
    else if (n > 2) topology = 'mesh';

    return { available: true, topology, links };
}

/**
 * Parse `nvidia-smi topo -m` output, returning a deduped list of
 * NVLink edges between GPU indices.
 */
export function parseNvidiaTopo(text) {
    const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
    // First header line names the columns. Normalize.
    const header = lines.shift();
    if (!header) return [];
    const cols = header.split(/\s+/).filter((c) => /^GPU\d+$/i.test(c));
    if (cols.length === 0) return [];

    const links = [];
    const seen = new Set();
    for (const line of lines) {
        const m = line.match(/^GPU(\d+)\s+(.*)$/i);
        if (!m) continue;
        const rowIdx = Number.parseInt(m[1], 10);
        const cells = m[2].split(/\s+/);
        for (let i = 0; i < cols.length && i < cells.length; i++) {
            const colName = cols[i];
            const colIdx = Number.parseInt(colName.replace(/^GPU/i, ''), 10);
            if (rowIdx === colIdx) continue;
            const cell = cells[i];
            // NV<n> entries indicate NVLink connections; X is self; SYS,
            // NODE, PHB, PIX, etc. are PCIe paths.
            if (!/^NV\d+$/i.test(cell)) continue;
            const a = Math.min(rowIdx, colIdx);
            const b = Math.max(rowIdx, colIdx);
            const key = `${a}-${b}`;
            if (seen.has(key)) continue;
            seen.add(key);
            links.push({ from: a, to: b, kind: cell.toUpperCase() });
        }
    }
    return links;
}

// ---------------------------------------------------------------------------
// InfiniBand — Linux exposes everything under /sys/class/infiniband/
// ---------------------------------------------------------------------------
const IB_SYSFS = '/sys/class/infiniband';

async function detectInfiniband() {
    const empty = { available: false, devices: [] };
    if (process.platform !== 'linux') return empty;

    let entries;
    try {
        entries = await readdir(IB_SYSFS);
    } catch {
        return empty;
    }
    if (!entries.length) return empty;

    const devices = [];
    for (const name of entries) {
        const dir = join(IB_SYSFS, name);
        const board_id = (await readSafe(join(dir, 'board_id'))) ?? null;

        let portEntries = [];
        try {
            portEntries = await readdir(join(dir, 'ports'));
        } catch {
            // No ports subdir → skip but still record the device.
        }

        if (!portEntries.length) {
            devices.push({ name, board_id, port: null, state: null, rate: null, link_layer: null });
            continue;
        }

        for (const port of portEntries) {
            const portDir = join(dir, 'ports', port);
            const stateRaw = (await readSafe(join(portDir, 'state'))) ?? '';
            const rate = (await readSafe(join(portDir, 'rate'))) ?? null;
            const linkLayer = (await readSafe(join(portDir, 'link_layer'))) ?? null;
            // state file looks like "4: ACTIVE" or "1: DOWN"
            const stateMatch = stateRaw.match(/:\s*(\w+)/);
            const state = stateMatch ? stateMatch[1].toLowerCase() : stateRaw || null;

            devices.push({
                name,
                board_id,
                port: Number.parseInt(port, 10),
                state,
                rate,
                link_layer: linkLayer
            });
        }
    }

    const anyActive = devices.some((d) => d.state === 'active');
    return { available: anyActive, devices };
}

async function readSafe(path) {
    try {
        const raw = await readFile(path, 'utf8');
        return raw.trim();
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Top-level
// ---------------------------------------------------------------------------
export async function detectInterconnects() {
    const [nvlink, infiniband] = await Promise.all([detectNvlink(), detectInfiniband()]);
    // RDMA is "we have something resembling an active IB or RoCE port".
    const rdma_capable =
        infiniband.available &&
        infiniband.devices.some((d) => d.state === 'active');
    return { nvlink, infiniband, rdma_capable };
}

/**
 * Build a process-env object that turns on detected interconnects for
 * common ML toolkits when spawning an engine / training worker.
 *
 *   - NVLink: Ollama, vLLM, llama.cpp pick this up automatically as
 *     long as CUDA isn't restricted to a single device. We surface a
 *     marker so the daemon can decide whether to enable
 *     tensor-parallel modes.
 *   - InfiniBand: NCCL (the all-reduce library every distributed-
 *     training framework uses) falls back to TCP unless NCCL_IB_DISABLE
 *     is explicitly off and an HCA is named. We emit NCCL_IB_DISABLE=0
 *     and NCCL_IB_HCA pointing at the active devices.
 *
 * Caller merges this object into the spawn env. Empty object when
 * nothing actionable is detected.
 */
export function interconnectEnv({ nvlink, infiniband, rdma_capable }) {
    const env = {};
    if (nvlink?.available) {
        env.INFERNET_NVLINK = '1';
        env.INFERNET_NVLINK_TOPOLOGY = nvlink.topology ?? 'unknown';
    }
    if (infiniband?.available) {
        const activeHcas = infiniband.devices
            .filter((d) => d.state === 'active' && d.name)
            .map((d) => (d.port != null ? `${d.name}:${d.port}` : d.name));
        if (activeHcas.length) {
            env.NCCL_IB_DISABLE = '0';
            env.NCCL_IB_HCA = activeHcas.join(',');
        }
    }
    if (rdma_capable) {
        env.INFERNET_RDMA = '1';
    }
    return env;
}

/**
 * Human one-liner for CLI output.
 */
export function formatInterconnectSummary({ nvlink, infiniband, rdma_capable }) {
    const parts = [];
    if (nvlink.available) {
        const links = nvlink.links.length;
        parts.push(`NVLink ${nvlink.topology} (${links} link${links === 1 ? '' : 's'})`);
    } else {
        parts.push('NVLink: none');
    }
    if (infiniband.available) {
        const active = infiniband.devices.filter((d) => d.state === 'active');
        parts.push(`InfiniBand ${active.length} active port${active.length === 1 ? '' : 's'}`);
    } else if (infiniband.devices.length > 0) {
        parts.push(`InfiniBand present (no active ports)`);
    } else {
        parts.push('InfiniBand: none');
    }
    if (rdma_capable) parts.push('RDMA-capable');
    return parts.join(' · ');
}
