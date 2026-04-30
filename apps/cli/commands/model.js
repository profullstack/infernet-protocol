/**
 * `infernet model` — model lifecycle (Ollama + HuggingFace).
 *
 * Distinct from the node-lifecycle `infernet update` / `infernet remove`:
 * those manage how this node is registered with the control plane.
 * This command manages which models the node has on disk and which one
 * the engine uses by default.
 *
 *   infernet model list
 *   infernet model pull <name>           Ollama name or hf:org/repo
 *   infernet model remove <name>
 *   infernet model use <name>
 *   infernet model show
 *
 * Ollama models go through the local Ollama daemon.
 * HuggingFace models (hf: prefix) are downloaded via huggingface-cli
 * and are intended for vLLM / SGLang serving.
 */

import { spawn } from "node:child_process";
import { loadConfig, saveConfig, getConfigPath } from "../lib/config.js";
import { checkModelFits } from "../lib/model-fit.js";
import {
    resolveHfToken,
    fetchHfModelInfo,
    downloadHfModel,
} from "../lib/hf-model.js";

const HELP = `infernet model — manage models served by this node

Usage:
  infernet model list                    List models pulled locally.
  infernet model pull <name>             Pull an Ollama model (e.g. qwen2.5:7b).
  infernet model pull hf:<org>/<repo>    Download a HuggingFace model (vLLM/SGLang).
  infernet model remove <name>           Delete a pulled model.
  infernet model use <name>              Set this as the default for the engine.
  infernet model show                    Show the engine default + Ollama host.

Examples:
  infernet model pull qwen2.5:7b
  infernet model pull hf:NousResearch/Hermes-3-Llama-3.1-8B
  infernet model use qwen2.5:7b
  infernet model list

Defaults are stored in ~/.config/infernet/config.json under engine.*
and consumed by the daemon and \`infernet chat\`.
`;

const DEFAULT_HOST = "http://localhost:11434";

function resolveHost(config) {
    return (
        config?.engine?.ollamaHost ??
        process.env.OLLAMA_HOST ??
        DEFAULT_HOST
    );
}

async function fetchTags(host) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    try {
        const res = await fetch(new URL("/api/tags", host), { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        clearTimeout(t);
        throw new Error(
            `Ollama not reachable at ${host} (${err?.message ?? err}). Run \`infernet setup\` first.`
        );
    }
}

async function deleteModel(host, name) {
    const res = await fetch(new URL("/api/delete", host), {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name })
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Ollama HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    }
}



function streamPull(name) {
    return new Promise((resolve, reject) => {
        // Use the local `ollama` CLI for the pull because it gives a much
        // nicer progress UI than streaming JSON from /api/pull. The
        // /api/pull endpoint is fine for programmatic use; for an
        // interactive operator, ollama's own bar is the right tool.
        const child = spawn("ollama", ["pull", name], { stdio: "inherit" });
        child.on("exit", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`ollama pull exited ${code}`));
        });
        child.on("error", reject);
    });
}

async function cmdList(host) {
    const cfg = await loadConfig();
    const active = cfg?.engine?.model ?? null;
    const hfModels = cfg?.engine?.hfModels ?? [];

    // Ollama models
    let ollamaModels = [];
    try {
        const tags = await fetchTags(host);
        ollamaModels = tags.models ?? [];
    } catch {
        // Ollama not running — still show HF models
    }

    const allEmpty = ollamaModels.length === 0 && hfModels.length === 0;
    if (allEmpty) {
        process.stdout.write("(no models pulled — try `infernet model pull qwen2.5:7b` or `infernet model pull hf:org/repo`)\n");
        return 0;
    }

    const allNames = [
        ...ollamaModels.map(m => m.name ?? ""),
        ...hfModels.map(m => m.repoId),
    ];
    const nameWidth = Math.max(4, ...allNames.map(n => n.length));
    process.stdout.write(`${"NAME".padEnd(nameWidth)}  SIZE        BACKEND   ACTIVE\n`);

    for (const m of ollamaModels) {
        const size = typeof m.size === "number"
            ? `${(m.size / 1024 / 1024 / 1024).toFixed(1)} GB`
            : "?";
        const isActive = m.name === active ? "  *" : "";
        process.stdout.write(`${(m.name ?? "").padEnd(nameWidth)}  ${size.padEnd(10)}  ollama  ${isActive}\n`);
    }

    for (const m of hfModels) {
        const size = m.sizeGb ? `${m.sizeGb} GB` : "?";
        const isActive = m.repoId === active ? "  *" : "";
        process.stdout.write(`${m.repoId.padEnd(nameWidth)}  ${size.padEnd(10)}  vllm    ${isActive}\n`);
    }

    if (active) {
        process.stdout.write(`\nactive: ${active}\n`);
    }
    return 0;
}

async function cmdHfPull(repoId, opts = {}) {
    const token = await resolveHfToken();

    process.stdout.write(`\nFetching metadata for ${repoId}…\n`);
    let info;
    try {
        info = await fetchHfModelInfo(repoId, token);
    } catch (err) {
        process.stderr.write(`error: ${err?.message ?? err}\n`);
        return 1;
    }

    process.stdout.write(`\n  repo:      ${info.repoId}\n`);
    process.stdout.write(`  type:      ${info.modelType ?? 'unknown'}\n`);
    process.stdout.write(`  size:      ${info.sizeGb != null ? info.sizeGb + ' GB' : 'unknown'}\n`);
    process.stdout.write(`  pipeline:  ${info.pipeline}\n`);
    process.stdout.write(`  backend:   ${info.recommendedBackend === 'vllm_or_sglang' ? 'vLLM / SGLang (Ollama not supported)' : 'Ollama or vLLM'}\n`);
    if (info.isMoe) process.stdout.write(`  ⚠  MoE model — requires vLLM or SGLang (not Ollama)\n`);
    process.stdout.write('\n');

    let localPath;
    try {
        localPath = await downloadHfModel(repoId, token, {});
    } catch (err) {
        process.stderr.write(`error: ${err?.message ?? err}\n`);
        return 1;
    }

    // Save to config under engine.hfModels
    const cfg = (await loadConfig()) ?? {};
    const hfModels = cfg.engine?.hfModels ?? [];
    const existing = hfModels.findIndex(m => m.repoId === repoId);
    const entry = { repoId, localPath, sizeGb: info.sizeGb, pulledAt: new Date().toISOString() };
    if (existing >= 0) hfModels[existing] = entry;
    else hfModels.push(entry);
    await saveConfig({ ...cfg, engine: { ...(cfg.engine ?? {}), hfModels } });

    process.stdout.write(`\nSaved to config. To serve with vLLM:\n`);
    process.stdout.write(`  vllm serve ${repoId} --host 0.0.0.0 --port 8000\n`);
    process.stdout.write(`\nThen set as active:\n`);
    process.stdout.write(`  infernet model use ${repoId}\n\n`);
    return 0;
}

async function cmdPull(host, name, opts = {}) {
    if (!name) {
        process.stderr.write("error: pull requires a model name (e.g. qwen2.5:7b or hf:org/repo)\n");
        return 2;
    }

    // HuggingFace path
    if (name.startsWith('hf:')) {
        return cmdHfPull(name.slice(3), opts);
    }

    // Quick reachability check before spawning ollama, so we get a friendly
    // error rather than a confusing CLI-not-found if Ollama isn't installed.
    await fetchTags(host);

    // Capacity check — always enforced unless --force is passed.
    if (!opts.force) {
        const fits = await checkModelFits(name);
        if (fits && !fits.ok) {
            process.stderr.write(
                `\n${name} (≈${fits.size_gb} GB) likely won't fit on this host:\n` +
                `  detected: ${fits.mode} with ${fits.have_gb} GB available\n` +
                `  ceiling:  ~${fits.ceiling_gb} GB (${fits.mode === "gpu" ? "85% of VRAM" : "60% of RAM"})\n` +
                `\nRefusing to pull. To override:\n` +
                `  infernet model pull ${name} --force\n` +
                `\nOr pick a smaller model — see https://ollama.com/library\n`
            );
            return 1;
        }
    }

    try {
        await streamPull(name);
    } catch (err) {
        process.stderr.write(`error: ${err?.message ?? err}\n`);
        process.stderr.write(
            `\nNothing pulled. Common causes:\n` +
            `  - typo in the model spec (try \`ollama list\` on the registry: https://ollama.com/library)\n` +
            `  - missing tag — try the bare model name (e.g. qwen2.5 → qwen2.5:latest)\n` +
            `  - private / gated model — pull manually with \`ollama pull ${name}\` to see the raw error\n`
        );
        return 1;
    }
    return 0;
}

async function cmdRemove(host, name) {
    if (!name) {
        process.stderr.write("error: remove requires a model name\n");
        return 2;
    }
    await deleteModel(host, name);
    process.stdout.write(`removed ${name}\n`);

    // If the removed one was the active default, clear it so the daemon
    // doesn't keep pointing at a missing model.
    const cfg = (await loadConfig()) ?? {};
    if (cfg.engine?.model === name) {
        const updated = { ...cfg, engine: { ...cfg.engine, model: null } };
        delete updated.engine.model;
        await saveConfig(updated);
        process.stdout.write(`(cleared engine.model in ${getConfigPath()} — set a new one with \`infernet model use <name>\`)\n`);
    }
    return 0;
}

async function cmdUse(host, name) {
    if (!name) {
        process.stderr.write("error: use requires a model name\n");
        return 2;
    }
    const cfg = (await loadConfig()) ?? {};

    // HuggingFace model path — verify it's in config
    if (name.includes('/') || name.startsWith('hf:')) {
        const repoId = name.startsWith('hf:') ? name.slice(3) : name;
        const hfModels = cfg.engine?.hfModels ?? [];
        if (!hfModels.some(m => m.repoId === repoId)) {
            process.stderr.write(
                `error: ${repoId} not found in local HF models. Pull it first:\n` +
                `  infernet model pull hf:${repoId}\n`
            );
            return 1;
        }
        await saveConfig({ ...cfg, engine: { ...(cfg.engine ?? {}), model: repoId, backend: 'vllm' } });
        process.stdout.write(`engine.model = ${repoId}  (backend: vllm)\n`);
        process.stdout.write(`Serve it with: vllm serve ${repoId} --host 0.0.0.0 --port 8000\n`);
        return 0;
    }

    // Ollama model — verify it's actually pulled
    const tags = await fetchTags(host);
    const have = (tags.models ?? []).map((m) => m.name).includes(name);
    if (!have) {
        process.stderr.write(
            `error: ${name} is not pulled locally. Pull it first: infernet model pull ${name}\n`
        );
        return 1;
    }
    const updated = {
        ...cfg,
        engine: { ...(cfg.engine ?? {}), model: name, backend: 'ollama' }
    };
    await saveConfig(updated);
    process.stdout.write(`engine.model = ${name}  (saved to ${getConfigPath()})\n`);
    return 0;
}

async function cmdShow(host) {
    const cfg = (await loadConfig()) ?? {};
    const model = cfg.engine?.model ?? null;
    const backend = cfg.engine?.backend ?? "auto";
    process.stdout.write(`backend:     ${backend}\n`);
    process.stdout.write(`ollama host: ${host}\n`);
    process.stdout.write(`model:       ${model ?? "(unset — use \`infernet model use <name>\`)"}\n`);
    return 0;
}

export default async function model(args) {
    if (args.has("help") || args.has("h")) {
        process.stdout.write(HELP);
        return 0;
    }
    const positional = args.positional ?? [];
    const sub = positional[0];
    const arg = positional[1];

    const cfg = (await loadConfig()) ?? {};
    const host = resolveHost(cfg);

    try {
        switch (sub) {
            case "list":
            case "ls":
                return await cmdList(host);
            case "pull":
            case "add":
                return await cmdPull(host, arg, {
                    force: args.has("force") || args.has("f"),
                    yes: args.has("yes") || args.has("y") || process.env.INFERNET_NONINTERACTIVE === "1"
                });
            case "remove":
            case "rm":
            case "delete":
                return await cmdRemove(host, arg);
            case "use":
            case "set":
                return await cmdUse(host, arg);
            case "show":
            case "current":
                return await cmdShow(host);
            default:
                process.stderr.write(
                    sub
                        ? `unknown subcommand: ${sub}\n\n`
                        : "error: missing subcommand\n\n"
                );
                process.stderr.write(HELP);
                return 2;
        }
    } catch (err) {
        process.stderr.write(`error: ${err?.message ?? err}\n`);
        return 1;
    }
}
