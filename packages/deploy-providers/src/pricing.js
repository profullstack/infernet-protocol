/**
 * Pricing-aware provider selection.
 *
 * Four presets reflect operator intent:
 *   cheap       — biased hard toward $/hr (price weight 0.70)
 *   balanced    — price + reliability roughly equal
 *   reliable    — bias toward known-stable providers
 *   production  — strong bias toward reliability + availability
 *
 * Per-provider scores (reliability, dx) are static curated values
 * today; future work derives them from observed deploy success
 * rate (IPIP-0019 §4 open question).
 */

export const PRESETS = Object.freeze({
    cheap:      { price: 0.70, reliability: 0.10, dx: 0.10, availability: 0.10 },
    balanced:   { price: 0.45, reliability: 0.25, dx: 0.20, availability: 0.10 },
    reliable:   { price: 0.25, reliability: 0.45, dx: 0.20, availability: 0.10 },
    production: { price: 0.15, reliability: 0.50, dx: 0.20, availability: 0.15 }
});

// Per-provider static scores. Curated from operator experience —
// would update from telemetry over time.
const PROVIDER_SCORES = Object.freeze({
    runpod:       { reliability: 0.85, dx: 0.85 },
    lambda:       { reliability: 0.90, dx: 0.80 },
    tensordock:   { reliability: 0.75, dx: 0.70 },
    digitalocean: { reliability: 0.90, dx: 0.85 },
    vast:         { reliability: 0.65, dx: 0.65 }
});

export function isValidPreset(name) {
    return Object.prototype.hasOwnProperty.call(PRESETS, name);
}

/**
 * Score a list of offers against a preset; returns the same offers
 * decorated with a `.score` (higher = better) and sorted descending.
 *
 * Hard filters before scoring: any offer where `available === false`
 * is excluded entirely. `maxPricePerHour` (if set on the preset
 * caller) is a hard cap — out-of-budget offers are dropped.
 */
export function rankOffers(offers, presetName, { maxPricePerHour = null } = {}) {
    if (!isValidPreset(presetName)) {
        throw new Error(`unknown pricing preset: ${presetName}`);
    }
    const weights = PRESETS[presetName];

    // Hard filter step.
    const eligible = offers.filter((o) => {
        if (o.available === false) return false;
        if (maxPricePerHour != null && o.pricePerHour > maxPricePerHour) return false;
        return true;
    });
    if (eligible.length === 0) return [];

    const maxPrice = Math.max(...eligible.map((o) => o.pricePerHour));
    const minPrice = Math.min(...eligible.map((o) => o.pricePerHour));
    const priceRange = Math.max(maxPrice - minPrice, 1e-6);

    return eligible
        .map((o) => {
            const provScores = PROVIDER_SCORES[o.providerId] ?? { reliability: 0.5, dx: 0.5 };
            // Normalized price: 1 = cheapest, 0 = most expensive.
            const normalizedPrice = 1 - (o.pricePerHour - minPrice) / priceRange;
            const score =
                normalizedPrice           * weights.price       +
                provScores.reliability    * weights.reliability +
                provScores.dx             * weights.dx          +
                (o.available ? 1 : 0)     * weights.availability;
            return { ...o, score };
        })
        .sort((a, b) => b.score - a.score);
}

/**
 * Format an hourly price as a cost block (hourly / daily / monthly).
 * Returns plain strings — no ANSI; caller decides styling.
 */
export function costBlock(pricePerHour) {
    const p = Number(pricePerHour);
    if (!Number.isFinite(p) || p < 0) {
        return { hourly: "?", daily: "?", monthly: "?" };
    }
    const fmt = (n) => `$${n.toFixed(2)}`;
    return {
        hourly: fmt(p) + "/hr",
        daily: fmt(p * 24) + "/day",
        monthly: fmt(p * 24 * 730 / 24) + "/month" // 730 hrs/month avg
    };
}
