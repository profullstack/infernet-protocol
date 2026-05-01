/**
 * `infernet inference` — distributed inference serving (IPIP-0031).
 *
 *   infernet inference serve --backend petals --model <hf-id>
 *       Starts a Petals server contributing this node's VRAM to the
 *       public swarm for the given model. Re-registers with the control
 *       plane so the dashboard learns this node is petals-serving X.
 *
 *   infernet inference status
 *       Shows whether a Petals server is running locally + which blocks
 *       it's holding for which model.
 *
 *   infernet inference stop
 *       Stops the locally-running Petals server.
 *
 * Petals (https://github.com/bigscience-workshop/petals) splits a
 * Llama-style transformer by layer across DHT-discovered volunteer
 * nodes. Each node holds N transformer blocks; activations flow through.
 * Bandwidth-tolerant — designed for residential connections.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadConfig } from "../lib/config.js";
import { startPetalsServer } from "../lib/inference/petals-engine.js";

const HELP = `infernet inference — distributed inference serving (Petals swarm)

Usage:
  infernet inference serve --model <hf-id> [flags]
  infernet inference status
  infernet inference stop

Flags (serve):
  --model <hf-id>          Required. e.g. meta-llama/Llama-3.1-70B-Instruct
  --backend <name>         petals (default; only supported backend today)
  --num-blocks <n>         How many transformer blocks to host (auto if omitted)
  --port <n>               Petals server port (default: 31330)
  --dht-prefix <str>       DHT initial peers (default: /petals/v3-public)
  --help

Examples:
  # Contribute to a Llama 3.1 70B swarm — node holds whatever blocks fit
  infernet inference serve --model meta-llama/Llama-3.1-70B-Instruct

  # Same but only host 6 blocks (smaller VRAM footprint)
  infernet inference serve --model meta-llama/Llama-3.1-70B-Instruct --num-blocks 6

What this means for the network:
  When you serve a model via Petals, the control plane registers your
  node as part of the swarm for that model. Inference requests with
  the "Distribute across all nodes" checkbox set on /chat will route
  through a Petals client that fans out across all swarm participants
  (you + everyone else serving the same model). Per-token receipts
  pay you for the blocks you contributed.

Prerequisites:
  pip install -U petals    # Python 3.10+
  Inbound port \${port} reachable (cloudflared works for residential setups)
`;

const STATE_DIR = path.join(process.env.HOME ?? "/tmp", ".infernet", "inference");

async function ensureStateDir() {
    await fsp.mkdir(STATE_DIR, { recursive: true });
}

async function readState() {
    try {
        const raw = await fsp.readFile(path.join(STATE_DIR, "state.json"), "utf8");
        return JSON.parse(raw);
    } catch { return null; }
}

async function writeState(s) {
    await ensureStateDir();
    await fsp.writeFile(path.join(STATE_DIR, "state.json"), JSON.stringify(s, null, 2));
}

async function pythonHasPetals() {
    return new Promise((resolve) => {
        const p = spawn("python3", ["-c", "import petals"], { stdio: "ignore" });
        p.on("exit", (code) => resolve(code === 0));
        p.on("error", () => resolve(false));
    });
}

async function cmdServe(args) {
    const model = args.get("model");
    if (!model) {
        process.stderr.write("error: --model <hf-id> is required\n");
        return 2;
    }
    const backend = args.get("backend") ?? "petals";
    if (backend !== "petals") {
        process.stderr.write(`error: only --backend petals is supported today (got ${backend})\n`);
        return 2;
    }
    const numBlocks = args.get("num-blocks") ? Number.parseInt(args.get("num-blocks"), 10) : null;
    const port = Number.parseInt(args.get("port") ?? "31330", 10);
    const prefix = args.get("dht-prefix") ?? "/petals/v3-public";

    if (!(await pythonHasPetals())) {
        process.stderr.write(
            "error: petals isn't installed. Run:\n  pip install -U petals\n" +
            "  python3 -c 'import petals'   # verify\n"
        );
        return 1;
    }

    process.stdout.write(`Starting Petals server for ${model} on :${port} (${numBlocks ?? "auto"} blocks)…\n`);
    process.stdout.write("Initial DHT peers: " + prefix + "\n");

    const child = startPetalsServer({ model, numBlocks, port, prefix });
    if (!child?.pid) {
        process.stderr.write("error: failed to spawn petals server\n");
        return 1;
    }

    await writeState({
        backend,
        model,
        port,
        prefix,
        num_blocks: numBlocks,
        pid: child.pid,
        started_at: new Date().toISOString()
    });

    // Pipe child output so the operator sees Petals' own startup logs
    // (which blocks it grabbed, DHT peers, etc).
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);

    process.stdout.write(
        `\n✓ Petals server pid=${child.pid} started.\n` +
        `   Re-register your node so the control plane learns about this:\n` +
        `   infernet register\n\n` +
        `   Stop with: infernet inference stop\n`
    );

    // Stay attached so the user sees logs; Ctrl-C will SIGTERM the child.
    process.on("SIGINT", () => { try { child.kill("SIGTERM"); } catch { /* ignore */ } });
    return new Promise((resolve) => {
        child.on("exit", async (code) => {
            await writeState({ backend, model, port, prefix, num_blocks: numBlocks, pid: null, exited_with: code, exited_at: new Date().toISOString() });
            resolve(code === 0 ? 0 : 1);
        });
    });
}

async function cmdStatus() {
    const state = await readState();
    if (!state) {
        process.stdout.write("(no inference server running locally)\n");
        return 0;
    }
    process.stdout.write(`backend:    ${state.backend}\n`);
    process.stdout.write(`model:      ${state.model}\n`);
    process.stdout.write(`port:       ${state.port}\n`);
    process.stdout.write(`pid:        ${state.pid ?? "(exited)"}\n`);
    if (state.pid) {
        const alive = (() => { try { process.kill(state.pid, 0); return true; } catch { return false; } })();
        process.stdout.write(`alive:      ${alive ? "yes" : "no — pid stale"}\n`);
    }
    if (state.exited_at) {
        process.stdout.write(`exited:     ${state.exited_at} (code ${state.exited_with})\n`);
    }
    return 0;
}

async function cmdStop() {
    const state = await readState();
    if (!state?.pid) {
        process.stdout.write("(nothing to stop)\n");
        return 0;
    }
    try {
        process.kill(state.pid, "SIGTERM");
        process.stdout.write(`SIGTERM sent to pid ${state.pid}\n`);
    } catch (err) {
        process.stderr.write(`could not kill pid ${state.pid}: ${err?.message ?? err}\n`);
        return 1;
    }
    return 0;
}

export default async function inference(args) {
    if (args.has("help") || args.has("h")) {
        process.stdout.write(HELP);
        return 0;
    }
    const sub = args.positional?.[0];
    switch (sub) {
        case "serve": case "start":  return cmdServe(args);
        case "status":               return cmdStatus();
        case "stop":                 return cmdStop();
        default:
            process.stderr.write(sub ? `unknown subcommand: ${sub}\n\n` : "error: missing subcommand\n\n");
            process.stderr.write(HELP);
            return 2;
    }
}

export { HELP };
