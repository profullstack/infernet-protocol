/**
 * Shared model-fit utilities — used by setup, model pull, and the
 * daemon's model_install node command so the capacity check is
 * enforced consistently regardless of how a pull is triggered.
 */

/**
 * Rough on-disk sizes (GB) for commonly used models. Unknown names
 * pass through unchecked — ollama will surface the error at pull time.
 */
export const KNOWN_MODEL_SIZES = {
    "qwen2.5:0.5b": 0.4,
    "qwen2.5:1.5b": 1.0,
    "qwen2.5:3b":   2.0,
    "qwen2.5:7b":   4.4,
    "qwen2.5:14b":  9.0,
    "qwen2.5:32b":  20.0,
    "qwen2.5:72b":  40.0,
    "llama3.2:1b":  1.3,
    "llama3.2:3b":  2.0,
    "llama3.1:8b":  4.7,
    "llama3.1:70b": 40.0,
    "mistral:7b":   4.4,
    "mixtral:8x7b": 26.0
};

/** Detect available VRAM (GPU) and RAM for fit checks. */
export async function detectCapacity() {
    try {
        const { detectGpus, detectHost } = await import("@infernetprotocol/gpu");
        const [gpus, host] = await Promise.all([detectGpus(), Promise.resolve(detectHost())]);
        const vramGb = gpus.reduce((a, g) => a + (Number.isFinite(g.vram_mb) ? g.vram_mb / 1024 : 0), 0);
        const ramGb = host.total_ram_mb / 1024;
        return { vram_gb: vramGb, ram_gb: ramGb };
    } catch {
        return { vram_gb: 0, ram_gb: 0 };
    }
}

/**
 * Returns { ok, mode, have_gb, ceiling_gb }.
 * GPU box: model fits if size ≤ 85% of VRAM.
 * CPU box: model fits if size ≤ 60% of RAM.
 */
export function checkFits({ size_gb, vram_gb, ram_gb }) {
    if (vram_gb > 0) {
        const ceiling = vram_gb * 0.85;
        return { ok: size_gb <= ceiling, mode: "gpu", have_gb: +vram_gb.toFixed(2), ceiling_gb: +ceiling.toFixed(2) };
    }
    if (ram_gb > 0) {
        const ceiling = ram_gb * 0.6;
        return { ok: size_gb <= ceiling, mode: "cpu", have_gb: +ram_gb.toFixed(2), ceiling_gb: +ceiling.toFixed(2) };
    }
    return { ok: true, mode: "unknown", have_gb: 0, ceiling_gb: null };
}

/**
 * Run a capacity check for a named model. Returns null if the model
 * size is unknown (can't check). Returns { ok, mode, have_gb,
 * ceiling_gb, size_gb } otherwise.
 */
export async function checkModelFits(name) {
    const size_gb = KNOWN_MODEL_SIZES[name];
    if (!Number.isFinite(size_gb)) return null;
    const cap = await detectCapacity();
    return { size_gb, ...checkFits({ size_gb, ...cap }) };
}
