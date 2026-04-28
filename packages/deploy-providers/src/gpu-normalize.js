/**
 * GPU name normalization — resolve common aliases across providers
 * to a canonical key so `--gpu 4090` works regardless of whether
 * RunPod calls it "RTX 4090", TensorDock calls it "rtx-4090", and
 * Lambda calls it "nvidia-rtx-4090".
 *
 * canonicalize("RTX 4090") → "4090"
 * aliasesFor("4090")       → ["rtx-4090", "nvidia-rtx-4090", "RTX 4090"]
 * matchesCanonical("4090", "RTX 4090") → true
 */

const ALIASES = {
    "3090":      ["rtx-3090", "nvidia-rtx-3090", "RTX 3090", "GeForce RTX 3090"],
    "4090":      ["rtx-4090", "nvidia-rtx-4090", "RTX 4090", "GeForce RTX 4090"],
    "a4000":     ["rtx-a4000", "NVIDIA RTX A4000", "RTX A4000"],
    "a5000":     ["rtx-a5000", "NVIDIA RTX A5000", "RTX A5000"],
    "a6000":     ["rtx-a6000", "NVIDIA RTX A6000", "RTX A6000"],
    "l4":        ["nvidia-l4", "L4", "Tesla L4"],
    "l40":       ["nvidia-l40", "L40", "Tesla L40"],
    "l40s":      ["nvidia-l40s", "L40S", "Tesla L40S"],
    "a100":      ["a100-40gb", "a100-80gb", "NVIDIA A100", "Tesla A100", "A100"],
    "a100-40gb": ["a100-pcie-40gb", "a100-sxm-40gb", "A100 40GB"],
    "a100-80gb": ["a100-sxm-80gb", "a100-pcie-80gb", "A100 80GB"],
    "h100":      ["h100-80gb", "h100-sxm", "h100-pcie", "NVIDIA H100", "H100"],
    "h100-80gb": ["h100-sxm-80gb", "h100-pcie-80gb"],
    "h200":      ["h200", "h200-141gb", "NVIDIA H200"]
};

// Build reverse index: lowercased alias → canonical
const REVERSE = (() => {
    const m = new Map();
    for (const [canonical, aliases] of Object.entries(ALIASES)) {
        m.set(canonical.toLowerCase(), canonical);
        for (const a of aliases) m.set(a.toLowerCase(), canonical);
    }
    return m;
})();

/**
 * Resolve any common alias to its canonical key. Returns null if
 * no match — caller decides how to handle (warn, exact-match,
 * fail, etc.).
 */
export function canonicalize(name) {
    if (!name) return null;
    const k = String(name).trim().toLowerCase();
    return REVERSE.get(k) ?? null;
}

/**
 * Return the list of provider-native aliases for a canonical key.
 * Used by adapters to translate `--gpu 4090` into queries against
 * each provider's native catalog.
 */
export function aliasesFor(canonical) {
    return ALIASES[canonical] ?? [];
}

/**
 * Does `query` (any alias form) refer to the same GPU as `canonical`?
 */
export function matchesCanonical(canonical, query) {
    return canonicalize(query) === canonical;
}

/**
 * All canonical keys (for help / autocomplete).
 */
export function knownGpus() {
    return Object.keys(ALIASES);
}
