/**
 * @infernetprotocol/engine — pluggable inference engine.
 *
 *   const engine = await createEngine();          // auto-selects
 *   const { stream } = engine.generate({ messages, model });
 *   for await (const ev of stream) {
 *     // ev.type ∈ "meta" | "token" | "done" | "error"
 *   }
 *   await engine.shutdown();
 *
 * Backends:
 *   - "vllm"   — high-throughput OpenAI-compatible server (PagedAttention,
 *                tensor + pipeline parallelism via Ray). NVIDIA-only.
 *   - "ollama" — talks to a local Ollama daemon (CUDA / ROCm / Metal / CPU).
 *                Easiest to set up; works on the widest hardware.
 *   - "mojo"   — spawns a Mojo + MAX binary (engine/mojo/). Experimental.
 *   - "stub"   — in-process canned tokens. Fallback for boxes with none.
 *
 * Auto-selection precedence (only if `opts.backend` is not set):
 *   1. process.env.INFERNET_ENGINE_BACKEND — explicit override
 *   2. process.env.INFERNET_ENGINE_BIN     — operator pointed at a Mojo binary
 *   3. vLLM reachable on VLLM_HOST          — operator's explicit setup wins
 *   4. Ollama reachable on OLLAMA_HOST      — easy default
 *   5. "stub"                                — canned tokens
 */

import { createMojoBackend } from "./backends/mojo.js";
import { createOllamaBackend, isOllamaReachable } from "./backends/ollama.js";
import { createVllmBackend, isVllmReachable } from "./backends/vllm.js";
import { createStubBackend } from "./backends/stub.js";

export * from "./protocol.js";
export { AsyncQueue } from "./async-queue.js";
export { EngineProcess } from "./engine-process.js";
export { resolveBinary } from "./resolve-binary.js";
export { isOllamaReachable } from "./backends/ollama.js";
export { isVllmReachable } from "./backends/vllm.js";

export async function createEngine(opts = {}) {
    const backend = opts.backend ?? (await autoSelectBackend());
    switch (backend) {
        case "vllm":
            return createVllmBackend(opts);
        case "ollama":
            return createOllamaBackend(opts);
        case "mojo":
            return createMojoBackend(opts);
        case "stub":
            return createStubBackend(opts);
        default:
            throw new Error(`unknown engine backend: ${backend}`);
    }
}

async function autoSelectBackend() {
    const explicit = process.env.INFERNET_ENGINE_BACKEND;
    if (explicit) return explicit;
    if (process.env.INFERNET_ENGINE_BIN) return "mojo";
    // vLLM is an explicit operator setup choice (heavy install, NVIDIA-only),
    // so a running vLLM server is a strong signal of intent — pick it
    // ahead of a passive Ollama install.
    if (await isVllmReachable(process.env.VLLM_HOST)) return "vllm";
    if (await isOllamaReachable(process.env.OLLAMA_HOST)) return "ollama";
    return "stub";
}
