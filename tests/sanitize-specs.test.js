import { describe, expect, it, vi } from "vitest";

// sanitizeSpecs lives in apps/web/lib/data/node-api.js, which imports
// "server-only" + Supabase. Stub those so this test can exercise the
// pure sanitizer without spinning up the full Next.js runtime.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
    getSupabaseServerClient: () => ({})
}));
vi.mock("@/lib/auth/verify-signed-request", () => ({
    tableForRole: () => "providers"
}));

const { sanitizeSpecs } = await import("@/lib/data/node-api");

describe("sanitizeSpecs — vram_tier handling", () => {
    it("trusts client-supplied vram_tier (the CLI never sends vram_mb)", () => {
        // Reproduces the Vast.ai RTX 5090 bug: the CLI sends an already-
        // classified tier string, no vram_mb. The server used to recompute
        // tier from the missing field and store "unknown". Trusting the
        // client tier (after enum validation) is the correct behavior.
        const out = sanitizeSpecs({
            gpus: [
                { vendor: "nvidia", vram_tier: "24-48gb", model: "NVIDIA GeForce RTX 5090" }
            ]
        });
        expect(out.gpus[0]).toEqual({
            vendor: "nvidia",
            vram_tier: "24-48gb",
            model: "NVIDIA GeForce RTX 5090"
        });
    });

    it("rejects an unrecognized vram_tier string and falls back to unknown", () => {
        const out = sanitizeSpecs({
            gpus: [{ vendor: "nvidia", vram_tier: "9001gb", model: "X" }]
        });
        expect(out.gpus[0].vram_tier).toBe("unknown");
    });

    it("falls back to deriving from vram_mb when no client tier provided", () => {
        const out = sanitizeSpecs({
            gpus: [{ vendor: "nvidia", vram_mb: 32 * 1024, model: "RTX 5090" }]
        });
        expect(out.gpus[0].vram_tier).toBe("24-48gb");
    });

    it("returns unknown when neither tier nor vram_mb is provided", () => {
        const out = sanitizeSpecs({
            gpus: [{ vendor: "nvidia", model: "Mystery card" }]
        });
        expect(out.gpus[0].vram_tier).toBe("unknown");
    });

    it("normalizes unknown vendor strings to 'unknown'", () => {
        const out = sanitizeSpecs({
            gpus: [{ vendor: "matrox", vram_tier: "<8gb", model: "G200" }]
        });
        expect(out.gpus[0].vendor).toBe("unknown");
    });

    it("caps gpu count at MAX_SPECS_GPUS", () => {
        const gpus = Array.from({ length: 32 }, (_, i) => ({
            vendor: "nvidia", vram_tier: "8-16gb", model: `card${i}`
        }));
        const out = sanitizeSpecs({ gpus });
        expect(out.gpus.length).toBeLessThanOrEqual(16);
    });
});
