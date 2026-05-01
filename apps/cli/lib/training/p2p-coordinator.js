/**
 * P2P training coordinator.
 *
 * Federated-LoRA flow:
 *   1. Discover candidate nodes — operator-owned providers whose
 *      reported VRAM tier meets the run's resources.min_vram_gb.
 *   2. Split JSONL dataset into N shards (one per node).
 *   3. Upload each shard to a public URL (S3/HF/whatever) — operator
 *      provides --shard-base-url that returns N {shard_url, upload_url}
 *      pairs OR we use a transient HF dataset.
 *   4. For each node: queue a `train_shard` command via the existing
 *      node_commands API. The daemon picks it up, pulls its shard,
 *      runs the same Unsloth script, posts the resulting adapter
 *      back via the upload URL.
 *   5. Poll command status; collect adapter URLs as nodes complete.
 *   6. Run FedAvg on the collected adapters → emit final adapter +
 *      checkpoint.
 *
 * Status: MVP. Step 3 (shard hosting) currently writes shards to a local
 * directory and expects the operator to expose them somewhere reachable
 * by the daemons (e.g. via a tunnel / S3 bucket). Step 6 invokes a
 * Python aggregator script.
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

/**
 * Split a JSONL file into N shards of roughly equal line count.
 * Writes shards to <outDir>/shard-<i>.jsonl.
 */
export async function splitJsonl({ inputPath, outDir, numShards }) {
    if (numShards <= 0) throw new Error("numShards must be > 0");
    const raw = await fs.readFile(inputPath, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    if (lines.length === 0) throw new Error(`${inputPath} is empty`);

    await fs.mkdir(outDir, { recursive: true });
    const shards = [];
    const perShard = Math.ceil(lines.length / numShards);
    for (let i = 0; i < numShards; i += 1) {
        const start = i * perShard;
        const end = Math.min(start + perShard, lines.length);
        if (start >= end) break;
        const shardPath = path.join(outDir, `shard-${i}.jsonl`);
        await fs.writeFile(shardPath, lines.slice(start, end).join("\n") + "\n");
        shards.push({ index: i, path: shardPath, lines: end - start });
    }
    return shards;
}

/**
 * Discover candidate nodes for a training run by hitting the
 * operator-side `/api/v1/user/nodes` route. Returns nodes filtered by
 * status="online" + vram tier meeting minVramGb (very rough — sanitized
 * telemetry only carries vram tier strings).
 */
export async function discoverNodes({ controlPlaneUrl, sessionToken, minVramGb = 8 }) {
    const res = await fetch(`${controlPlaneUrl}/api/v1/user/nodes`, {
        headers: { Authorization: `Bearer ${sessionToken}` }
    });
    if (!res.ok) throw new Error(`discover nodes: HTTP ${res.status}`);
    const body = await res.json();
    const nodes = body?.data ?? [];
    return nodes.filter((n) => {
        if (n.status !== "online") return false;
        const vramTier = (n.specs?.gpus ?? []).map((g) => g.vram_tier).find(Boolean) ?? "unknown";
        return tierMeets(vramTier, minVramGb);
    });
}

function tierMeets(tier, minVramGb) {
    const TIER_GB = { "<8gb": 6, "8-16gb": 12, "16-24gb": 20, "24-48gb": 36, ">=48gb": 64 };
    return (TIER_GB[tier] ?? 0) >= minVramGb;
}

/**
 * Queue a train_shard command for a single node via the user-facing
 * node_commands route.
 */
export async function queueTrainShard({ controlPlaneUrl, sessionToken, pubkey, args }) {
    const res = await fetch(
        `${controlPlaneUrl}/api/v1/user/nodes/${encodeURIComponent(pubkey)}/commands`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${sessionToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ command: "train_shard", args })
        }
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`queue train_shard: ${body?.error ?? res.statusText}`);
    return body.data;
}

/** Poll a command id until it leaves pending/running. */
export async function awaitCommand({ controlPlaneUrl, sessionToken, pubkey, commandId, timeoutMs = 30 * 60 * 1000 }) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const res = await fetch(
            `${controlPlaneUrl}/api/v1/user/nodes/${encodeURIComponent(pubkey)}/commands?limit=20`,
            { headers: { Authorization: `Bearer ${sessionToken}` } }
        );
        if (res.ok) {
            const body = await res.json();
            const cmd = (body?.data ?? []).find((c) => c.id === commandId);
            if (cmd && cmd.status !== "pending" && cmd.status !== "running") return cmd;
        }
        await new Promise((r) => setTimeout(r, 5000));
    }
    throw new Error(`command ${commandId} did not finish within ${Math.round(timeoutMs / 1000)}s`);
}

/**
 * Run the FedAvg aggregator over a list of adapter directories.
 * Emits <outDir>/checkpoint-final/ with the averaged adapter weights.
 *
 * Requires Python with `peft` + `safetensors` installed.
 */
export async function fedAvg({ adapterDirs, outDir }) {
    if (adapterDirs.length === 0) throw new Error("no adapters to average");

    const scriptPath = path.join(outDir, "_fedavg.py");
    await fs.writeFile(scriptPath, FEDAVG_SCRIPT);

    return new Promise((resolve, reject) => {
        const args = [scriptPath, "--out", path.join(outDir, "checkpoint-final"), ...adapterDirs];
        const child = spawn("python3", args, { stdio: "inherit" });
        child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`fedavg exited ${code}`)));
        child.on("error", reject);
    });
}

const FEDAVG_SCRIPT = `#!/usr/bin/env python3
"""Average LoRA adapters across N peers (Federated Averaging).

Loads the adapter_model.safetensors from each input directory, averages
matching tensors, writes the result to --out alongside one of the input
adapter_config.json files (they should match across peers).
"""
import argparse
import json
import shutil
from pathlib import Path

import torch
from safetensors.torch import load_file, save_file


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True)
    p.add_argument("inputs", nargs="+")
    args = p.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    inputs = [Path(d) for d in args.inputs]
    weight_files = [d / "adapter_model.safetensors" for d in inputs]
    for wf in weight_files:
        if not wf.exists():
            raise SystemExit(f"missing adapter_model.safetensors in {wf.parent}")

    print(f"averaging {len(weight_files)} adapters → {out}")
    state = {}
    for wf in weight_files:
        partial = load_file(str(wf))
        for k, v in partial.items():
            state.setdefault(k, []).append(v.float())

    averaged = {k: torch.stack(vs).mean(dim=0) for k, vs in state.items()}
    save_file(averaged, str(out / "adapter_model.safetensors"))

    # Copy adapter_config.json + tokenizer files from the first input
    for fname in ("adapter_config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json"):
        src = inputs[0] / fname
        if src.exists():
            shutil.copy(str(src), str(out / fname))

    summary = {"averaged_from": [str(p) for p in inputs], "tensors": len(averaged)}
    (out / "fedavg_summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
`;
