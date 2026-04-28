/**
 * `infernet model` — model lifecycle (Ollama-backed).
 *
 * Distinct from the node-lifecycle `infernet update` / `infernet remove`:
 * those manage how this node is registered with the control plane.
 * This command manages which models the node has on disk and which one
 * the engine uses by default.
 *
 *   infernet model list
 *   infernet model pull <name>
 *   infernet model remove <name>
 *   infernet model use <name>      # sets engine.model in config
 *   infernet model show            # current default
 *
 * All operations go through the local Ollama daemon. Use `infernet
 * setup` first if Ollama isn't installed.
 */

import { spawn } from "node:child_process";
import { loadConfig, saveConfig, getConfigPath } from "../lib/config.js";

const HELP = `infernet model — manage models served by this node

Usage:
  infernet model list                    List models pulled locally.
  infernet model pull <name>             Pull a model (e.g. qwen2.5:7b).
  infernet model remove <name>           Delete a pulled model.
  infernet model use <name>              Set this as the default for the engine.
  infernet model show                    Show the engine default + Ollama host.

Examples:
  infernet model pull qwen2.5:7b
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
    const tags = await fetchTags(host);
    const models = tags.models ?? [];
    if (models.length === 0) {
        process.stdout.write("(no models pulled — try `infernet model pull qwen2.5:7b`)\n");
        return 0;
    }
    const cfg = await loadConfig();
    const active = cfg?.engine?.model ?? null;
    const nameWidth = Math.max(4, ...models.map((m) => (m.name ?? "").length));
    process.stdout.write(`${"NAME".padEnd(nameWidth)}  SIZE        ACTIVE\n`);
    for (const m of models) {
        const size =
            typeof m.size === "number"
                ? `${(m.size / 1024 / 1024 / 1024).toFixed(1)} GB`
                : "?";
        const isActive = m.name === active ? "  *" : "";
        process.stdout.write(`${(m.name ?? "").padEnd(nameWidth)}  ${size.padEnd(10)}${isActive}\n`);
    }
    if (active) {
        process.stdout.write(`\nactive: ${active}\n`);
    }
    return 0;
}

async function cmdPull(host, name) {
    if (!name) {
        process.stderr.write("error: pull requires a model name (e.g. qwen2.5:7b)\n");
        return 2;
    }
    // Quick reachability check before spawning ollama, so we get a friendly
    // error rather than a confusing CLI-not-found if Ollama isn't installed.
    await fetchTags(host);
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
    // Verify it's actually pulled, so we don't save a typo into config.
    const tags = await fetchTags(host);
    const have = (tags.models ?? []).map((m) => m.name).includes(name);
    if (!have) {
        process.stderr.write(
            `error: ${name} is not pulled locally. Pull it first: infernet model pull ${name}\n`
        );
        return 1;
    }
    const cfg = (await loadConfig()) ?? {};
    const updated = {
        ...cfg,
        engine: { ...(cfg.engine ?? {}), model: name }
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
                return await cmdPull(host, arg);
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
