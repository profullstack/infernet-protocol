/**
 * Petals engine adapter — DISTRIBUTED inference across the volunteer
 * swarm (IPIP-0031, follow-up PR).
 *
 * Petals (https://github.com/bigscience-workshop/petals) splits a
 * Llama/Mixtral-style transformer by layer across DHT-discovered nodes.
 * Each node holds a few transformer blocks; activations flow through.
 * Designed for residential bandwidth — exactly the Infernet model.
 *
 * STATUS: scaffolding only. The flow:
 *
 *   serve()    — operator runs `infernet inference serve --backend petals
 *                --model meta-llama/Llama-3.1-70B`. We:
 *                1. spawn `python -m petals.cli.run_server <model>`
 *                2. register the operator as a Petals server in our
 *                   own registry: row in providers.specs.petals_models
 *                3. heartbeat that the server is alive
 *
 *   client()   — control plane's chat router, when input_spec.distributed
 *                is true, runs a Petals CLIENT (Python subprocess or
 *                a thin TS wrapper) that fans out across the swarm.
 *                Tokens stream back to the SSE handler exactly like
 *                Ollama's stream.
 *
 *   The SSE handler in apps/web/app/api/chat/stream/[jobId]/route.js
 *   already has the typed events plumbing — when distributed===true,
 *   it would call into routePetalsRequest below instead of subscribing
 *   to job_events.
 *
 * To-do for the follow-up PR:
 *   - bundle a thin Python venv with Petals at infernet setup time
 *   - add `infernet inference serve --backend petals` as a top-level command
 *   - register petals_models on heartbeat so the dashboard can show
 *     "this model is served by 8 nodes via Petals · ~12 tok/s" badges
 *   - wire the SSE handler's distributed branch through routePetalsRequest
 *   - per-token receipts to operators contributing layers (CPR / IPIP-0007)
 */

import { spawn } from "node:child_process";

const DEFAULT_DHT_PREFIX = "/petals/v3-public";

/**
 * Start a Petals server contributing this node's VRAM to the swarm.
 * Returns a child handle the daemon can monitor + restart.
 */
export function startPetalsServer({ model, numBlocks, port = 31330, prefix = DEFAULT_DHT_PREFIX }) {
    const args = ["-m", "petals.cli.run_server", model];
    if (numBlocks) args.push("--num_blocks", String(numBlocks));
    if (port) args.push("--port", String(port));
    if (prefix) args.push("--initial_peers", prefix);
    const child = spawn("python3", args, { stdio: ["ignore", "pipe", "pipe"] });
    return child;
}

/**
 * Run a single inference through a Petals client and stream tokens.
 * Returns an async iterable of { type: 'token' | 'done' | 'error', data }.
 *
 * Currently a stub — wires up the subprocess but doesn't translate the
 * Python output into typed events. Follow-up PR: pip install
 * `petals` in our control-plane container and call from a Python
 * worker, OR use a JS-native bridge once one exists.
 */
export async function* routePetalsRequest({ model, messages, maxTokens = 256, temperature = 0.7 }) {
    yield {
        type: "error",
        data: {
            message:
                `Distributed inference via Petals is in scaffolding (IPIP-0031). ` +
                `For now, this request needs to fall back to a single-node provider. ` +
                `Track progress at https://github.com/infernetprotocol/infernet-protocol/issues`
        }
    };
}
