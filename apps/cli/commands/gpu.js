/**
 * `infernet gpu` — print every locally-detected GPU and CPU group.
 *
 * Shells out to vendor tooling for GPUs (nvidia-smi, rocm-smi,
 * system_profiler on macOS) and uses node:os for CPU info. Multiple
 * of either are listed individually.
 *
 * Privacy: detection happens locally. The control plane only ever
 * receives the coarse `{ vendor, vram_tier, model }` GPU summary
 * via `infernet register` / heartbeats — no CPU info, no hostname,
 * no full model strings (per IPIP-0001).
 */

import { detectGpus, formatGpuLine, detectCpus, detectHost, formatCpuLine } from "@infernetprotocol/gpu";

const HELP = `infernet gpu — list local hardware

Usage:
  infernet gpu [flags]

Flags:
  --json     Emit JSON instead of human-readable
  -h, --help Show this help

What it shows:
  - Every detected GPU (NVIDIA via nvidia-smi, AMD via rocm-smi,
    Apple Silicon via system_profiler) with vendor, model, VRAM,
    utilization, temperature, power, and driver version.
  - Every CPU group (collapsed by model — most machines have one;
    heterogeneous boxes like Apple Silicon list their P+E cores).
  - Host platform / arch / total RAM.

The list is local-only — nothing here is sent to the control plane
without your explicit opt-in via 'infernet register'.
`;

function jsonReport(gpus, cpus, host) {
    return {
        host,
        gpus,
        cpus
    };
}

function summary(count, label) {
    if (count === 0) return `0 ${label}`;
    if (count === 1) return `1 ${label}`;
    return `${count} ${label}s`;
}

export default async function gpuCommand(args) {
    if (args.has("help") || args.has("h")) {
        process.stdout.write(HELP);
        return 0;
    }

    const json = args.has("json");

    let gpus = [];
    try {
        gpus = await detectGpus();
    } catch (err) {
        process.stderr.write(`gpu detection error: ${err?.message ?? err}\n`);
    }
    const cpus = detectCpus();
    const host = detectHost();

    if (json) {
        process.stdout.write(JSON.stringify(jsonReport(gpus, cpus, host), null, 2) + "\n");
        return 0;
    }

    process.stdout.write(`\nHost\n`);
    process.stdout.write(`  platform:  ${host.platform}/${host.arch}\n`);
    process.stdout.write(`  node:      v${host.node_version}\n`);
    process.stdout.write(`  ram:       ${(host.total_ram_mb / 1024).toFixed(1)} GB total, ${(host.free_ram_mb / 1024).toFixed(1)} GB free\n`);
    process.stdout.write(`  load avg:  ${host.load_avg.map((n) => n.toFixed(2)).join(" / ")}\n`);

    process.stdout.write(`\nCPU (${summary(cpus.length, "group")}, ${host.cpu_count} logical cores)\n`);
    if (cpus.length === 0) {
        process.stdout.write(`  (none detected)\n`);
    } else {
        for (const c of cpus) {
            process.stdout.write(`  ${formatCpuLine(c)}\n`);
        }
    }

    process.stdout.write(`\nGPU (${summary(gpus.length, "device")})\n`);
    if (gpus.length === 0) {
        process.stdout.write(`  (none detected — CPU-only provider)\n`);
        process.stdout.write(`  ${"-".repeat(40)}\n`);
        process.stdout.write(`  Need GPU tooling? Install one of:\n`);
        process.stdout.write(`    nvidia-smi       (NVIDIA driver + CUDA)\n`);
        process.stdout.write(`    rocm-smi         (AMD ROCm stack)\n`);
        process.stdout.write(`    system_profiler  (macOS — bundled)\n`);
    } else {
        for (const g of gpus) {
            process.stdout.write(`  ${formatGpuLine(g)}\n`);
        }
    }
    process.stdout.write(`\n`);
    return 0;
}
