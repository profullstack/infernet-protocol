/**
 * Model-fit warnings — estimate VRAM requirements for known model
 * families before deploying. Warns the operator when the chosen
 * GPU likely can't fit the model without quantization, but does
 * NOT block (community quantizations ship faster than this table
 * can keep up; strict-mode is opt-in).
 *
 * VRAM estimates are FP16/BF16 weights only — operators using
 * AWQ / GPTQ / FP8 quantization get a much smaller footprint
 * (typically ~25% of FP16).
 */

// Param-count → FP16 VRAM bytes ratio: 2 bytes/param + ~20% overhead
// for activations / KV cache headroom on a 4-8k-token context.
function fp16VramGb(billionsParams) {
    return Math.ceil(billionsParams * 2 * 1.2);
}

// Best-effort param-count estimates for common open-weight families.
// Keyed on substring match (case-insensitive).
const MODEL_PARAMS_BILLIONS = [
    [/qwen.*0\.5b/i,        0.5],
    [/qwen.*1\.5b/i,        1.5],
    [/qwen.*3b/i,           3],
    [/qwen.*7b/i,           7],
    [/qwen.*9b/i,           9],
    [/qwen.*14b/i,          14],
    [/qwen.*32b/i,          32],
    [/qwen.*72b/i,          72],
    [/llama.*3.*1b/i,       1],
    [/llama.*3.*3b/i,       3],
    [/llama.*3.*8b/i,       8],
    [/llama.*3.*70b/i,      70],
    [/llama.*3.*405b/i,     405],
    [/mistral.*7b/i,        7],
    [/mixtral.*8x7b/i,      47],   // 8×7B MoE — only ~13B active but 47B total weights
    [/mixtral.*8x22b/i,     141],
    [/gemma.*2b/i,          2],
    [/gemma.*7b/i,          7],
    [/gemma.*9b/i,          9],
    [/gemma.*27b/i,         27],
    [/phi.*3.*mini/i,       3.8],
    [/phi.*3.*medium/i,     14],
    [/deepseek.*7b/i,       7],
    [/deepseek.*67b/i,      67],
    [/deepseek-v2/i,        236],
    [/deepseek-v3/i,        685]
];

const QUANT_FACTOR = {
    none:     1.0,
    auto:     1.0,
    float16:  1.0,
    bfloat16: 1.0,
    fp16:     1.0,
    bf16:     1.0,
    fp8:      0.55,
    awq:      0.27,    // 4-bit
    gptq:     0.27,
    int4:     0.27
};

/**
 * Estimate VRAM (GB) needed for a model + quantization pair.
 * Returns null if the model isn't recognized — caller decides
 * whether to warn "unknown model" or proceed silently.
 */
export function estimateModelVramGb(modelId, quantization = "none") {
    if (!modelId) return null;
    const match = MODEL_PARAMS_BILLIONS.find(([re]) => re.test(modelId));
    if (!match) return null;
    const [, billions] = match;
    const factor = QUANT_FACTOR[String(quantization).toLowerCase()] ?? 1.0;
    return Math.ceil(fp16VramGb(billions) * factor);
}

/**
 * Decide whether the model fits on the offered GPU(s).
 * Returns `{ fits, requiredVramGb, availableVramGb, recommendations[] }`.
 * fits === null when we don't know (unknown model).
 */
export function checkModelFit({ modelId, quantization, vramGb, gpuCount = 1 } = {}) {
    const required = estimateModelVramGb(modelId, quantization);
    if (required == null) {
        return {
            fits: null,
            requiredVramGb: null,
            availableVramGb: vramGb * gpuCount,
            recommendations: []
        };
    }
    const available = vramGb * gpuCount;
    // Need at least 110% headroom for KV cache during generation.
    const fits = available >= required * 1.1;
    const recommendations = [];
    if (!fits) {
        if ((quantization ?? "none") === "none") {
            recommendations.push("--quantization awq      (~4× smaller)");
            recommendations.push("--quantization fp8       (~2× smaller)");
        }
        if (gpuCount === 1) {
            recommendations.push(`--gpu-count 2            (tensor-parallel)`);
        }
        if (vramGb < 80) {
            recommendations.push("--gpu a100-80gb          (single GPU, more VRAM)");
            recommendations.push("--gpu h100               (newer, fast inference)");
        }
    }
    return { fits, requiredVramGb: required, availableVramGb: available, recommendations };
}

/**
 * Format the fit result as a human-readable warning block; returns
 * null if the model fits or is unknown (caller skips printing).
 */
export function formatFitWarning({ modelId, quantization, vramGb, gpuCount, gpuName }) {
    const result = checkModelFit({ modelId, quantization, vramGb, gpuCount });
    if (result.fits === true || result.fits === null) return null;
    const lines = [
        `Warning: ${modelId} (~${result.requiredVramGb} GB${quantization && quantization !== "none" ? ` ${quantization}` : " FP16"})`,
        `         likely won't fit on ${gpuCount}× ${gpuName} (${result.availableVramGb} GB total).`,
        ``,
        `Recommended:`,
        ...result.recommendations.map((r) => `  ${r}`)
    ];
    return lines.join("\n");
}
