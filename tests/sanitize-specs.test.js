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

describe("sanitizeSpecs — cli_version", () => {
    it("preserves a well-formed cli_version through register", () => {
        const out = sanitizeSpecs({ gpus: [], cli_version: "0.1.41" });
        expect(out.cli_version).toBe("0.1.41");
    });

    it("preserves prerelease + build-metadata semver shapes", () => {
        const out = sanitizeSpecs({ gpus: [], cli_version: "1.2.3-rc.1+build.5" });
        expect(out.cli_version).toBe("1.2.3-rc.1+build.5");
    });

    it("drops a hostile cli_version that includes whitespace or shell chars", () => {
        const out = sanitizeSpecs({ gpus: [], cli_version: "0.1.41; rm -rf /" });
        expect(out.cli_version).toBeNull();
    });

    it("drops missing / non-string cli_version", () => {
        expect(sanitizeSpecs({ gpus: [] }).cli_version).toBeNull();
        expect(sanitizeSpecs({ gpus: [], cli_version: 41 }).cli_version).toBeNull();
    });
});

describe("sanitizeSpecs — IPIP-0033 rpc + rpc_primary slots", () => {
    it("preserves a well-formed rpc slot", () => {
        const out = sanitizeSpecs({
            gpus: [],
            rpc: {
                engine: "llama.cpp",
                version: "0.1.41",
                models: ["qwen2.5:72b"],
                host: "10.0.0.7",
                port: 50052,
                vram_gb: 24,
                ram_gb: 32,
                max_concurrent: 2
            }
        });
        expect(out.rpc).toEqual({
            engine: "llama.cpp",
            version: "0.1.41",
            models: ["qwen2.5:72b"],
            host: "10.0.0.7",
            port: 50052,
            vram_gb: 24,
            ram_gb: 32,
            max_concurrent: 2
        });
    });

    it("drops the rpc slot when models[] is empty", () => {
        const out = sanitizeSpecs({ gpus: [], rpc: { models: [], port: 50052 } });
        expect(out.rpc).toBeUndefined();
    });

    it("rejects out-of-range ports", () => {
        const out = sanitizeSpecs({
            gpus: [],
            rpc: { models: ["x"], host: "h", port: 99999 }
        });
        expect(out.rpc.port).toBeNull();
    });

    it("caps max_concurrent at 64 and floors below 1 → default 1", () => {
        const big = sanitizeSpecs({ gpus: [], rpc: { models: ["x"], max_concurrent: 9999 } });
        expect(big.rpc.max_concurrent).toBe(64);
        const zero = sanitizeSpecs({ gpus: [], rpc: { models: ["x"], max_concurrent: 0 } });
        expect(zero.rpc.max_concurrent).toBe(1);
    });

    it("preserves a primary slot with just models", () => {
        const out = sanitizeSpecs({
            gpus: [],
            rpc_primary: { models: ["qwen2.5:72b"], engine: "llama.cpp", version: "0.1.41" }
        });
        expect(out.rpc_primary).toEqual({
            engine: "llama.cpp",
            version: "0.1.41",
            models: ["qwen2.5:72b"]
        });
    });

    it("drops rpc_primary when models is missing or empty", () => {
        expect(sanitizeSpecs({ gpus: [], rpc_primary: {} }).rpc_primary).toBeUndefined();
        expect(sanitizeSpecs({ gpus: [], rpc_primary: { models: [] } }).rpc_primary).toBeUndefined();
    });

    it("omits rpc fields entirely when no slot is sent", () => {
        const out = sanitizeSpecs({ gpus: [] });
        expect(out.rpc).toBeUndefined();
        expect(out.rpc_primary).toBeUndefined();
    });
});
