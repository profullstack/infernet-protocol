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
 *   - "max"     — Modular MAX serve (highest throughput, OpenAI-compatible).
 *                 MODULAR_MAX_HOST or default :8000.
 *   - "sglang"  — SGLang (RadixAttention, speculative decoding). SGLANG_HOST
 *                 or default :30000.
 *   - "vllm"    — vLLM (PagedAttention, tensor parallelism via Ray). VLLM_HOST
 *                 or default :8000.
 *   - "llamacpp" — llama.cpp / llama-swap. Lightweight, no Python. :8080.
 *   - "ollama"  — Ollama daemon. Easiest setup; CUDA/ROCm/Metal/CPU.
 *   - "mojo"    — Mojo + MAX binary. Experimental.
 *   - "stub"    — in-process canned tokens. Fallback when nothing else runs.
 *
 * Auto-selection precedence (only if `opts.backend` is not set):
 *   1. INFERNET_ENGINE_BACKEND env var — explicit override
 *   2. INFERNET_ENGINE_BIN set         — operator's Mojo binary
 *   3. MODULAR_MAX_HOST set + reachable — MAX (best throughput)
 *   4. SGLang reachable on SGLANG_HOST  — :30000
 *   5. vLLM reachable on VLLM_HOST      — :8000
 *   6. llama.cpp reachable              — :8080
 *   7. Ollama reachable                 — easy default
 *   8. "stub"
 */

import { createMojoBackend } from "./backends/mojo.js";
import { createOllamaBackend, isOllamaReachable } from "./backends/ollama.js";
import { createVllmBackend, isVllmReachable } from "./backends/vllm.js";
import { createSglangBackend, isSglangReachable } from "./backends/sglang.js";
import { createMaxBackend, isMaxReachable } from "./backends/max.js";
import { createLlamacppBackend, isLlamacppReachable } from "./backends/llamacpp.js";
import { createStubBackend } from "./backends/stub.js";

export * from "./protocol.js";
export { AsyncQueue } from "./async-queue.js";
export { EngineProcess } from "./engine-process.js";
export { resolveBinary } from "./resolve-binary.js";
export { isOllamaReachable } from "./backends/ollama.js";
export { isVllmReachable } from "./backends/vllm.js";
export { isSglangReachable } from "./backends/sglang.js";
export { isMaxReachable } from "./backends/max.js";
export { isLlamacppReachable } from "./backends/llamacpp.js";

export async function createEngine(opts = {}) {
    const backend = opts.backend ?? (await autoSelectBackend());
    switch (backend) {
        case "max":
            return createMaxBackend(opts);
        case "sglang":
            return createSglangBackend(opts);
        case "vllm":
            return createVllmBackend(opts);
        case "llamacpp":
            return createLlamacppBackend(opts);
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
    // Precedence: MAX > SGLang > vLLM (throughput order per benchmarks) >
    // llama.cpp (lightweight, no Python) > Ollama (widest hardware support).
    // MAX shares port 8000 with vLLM — distinguish via MODULAR_MAX_HOST.
    if (process.env.MODULAR_MAX_HOST && await isMaxReachable(process.env.MODULAR_MAX_HOST)) return "max";
    if (await isSglangReachable(process.env.SGLANG_HOST)) return "sglang";
    if (await isVllmReachable(process.env.VLLM_HOST)) return "vllm";
    if (await isLlamacppReachable(process.env.LLAMACPP_HOST)) return "llamacpp";
    if (await isOllamaReachable(process.env.OLLAMA_HOST)) return "ollama";
    return "stub";
}
