import { describe, expect, it } from "vitest";
import { filterFittingModels } from "../apps/cli/commands/register.js";

// Don't import server-only modules in vitest's node env. Re-export
// reputationWeightedPick from the same file.
import { reputationWeightedPick } from "../apps/web/lib/data/chat.js";

const GB = 1024 ** 3;

describe("filterFittingModels", () => {
    it("accepts every model on a generous GPU box", () => {
        const result = filterFittingModels(
            [
                { name: "qwen2.5:0.5b", size_bytes: 0.4 * GB },
                { name: "qwen2.5:7b", size_bytes: 4.4 * GB },
                { name: "llama3:70b", size_bytes: 40 * GB }
            ],
            { totalVramBytes: 80 * GB, totalRamBytes: 256 * GB }
        );
        expect(result.fitting).toEqual(["qwen2.5:0.5b", "qwen2.5:7b", "llama3:70b"]);
        expect(result.rejected).toEqual([]);
        expect(result.mode).toBe("gpu");
    });

    it("rejects models that don't fit on a tight CPU-only box", () => {
        const result = filterFittingModels(
            [
                { name: "qwen2.5:0.5b", size_bytes: 0.4 * GB },
                { name: "qwen2.5:7b", size_bytes: 4.4 * GB },
                { name: "qwen3.5:9b", size_bytes: 5.5 * GB }
            ],
            { totalVramBytes: 0, totalRamBytes: 6 * GB } // 6 GB RAM × 0.6 = 3.6 GB ceiling
        );
        expect(result.fitting).toEqual(["qwen2.5:0.5b"]);
        expect(result.rejected).toHaveLength(2);
        expect(result.rejected.map((r) => r.name)).toEqual(["qwen2.5:7b", "qwen3.5:9b"]);
        expect(result.mode).toBe("cpu");
    });

    it("rejects an oversized model on a small GPU", () => {
        const result = filterFittingModels(
            [
                { name: "qwen2.5:7b", size_bytes: 4.4 * GB },
                { name: "llama3:70b", size_bytes: 40 * GB }
            ],
            { totalVramBytes: 8 * GB, totalRamBytes: 32 * GB } // 8 × 0.85 = 6.8 GB ceiling
        );
        expect(result.fitting).toEqual(["qwen2.5:7b"]);
        expect(result.rejected.map((r) => r.name)).toEqual(["llama3:70b"]);
    });

    it("passes through models with unknown size (Ollama didn't report)", () => {
        const result = filterFittingModels(
            [{ name: "mystery:7b", size_bytes: null }],
            { totalVramBytes: 0, totalRamBytes: 1 * GB }
        );
        expect(result.fitting).toEqual(["mystery:7b"]);
        expect(result.rejected).toEqual([]);
    });

    it("multi-GPU sums VRAM (tensor parallelism)", () => {
        const result = filterFittingModels(
            [{ name: "llama3:70b", size_bytes: 40 * GB }],
            { totalVramBytes: 24 * GB + 24 * GB, totalRamBytes: 32 * GB } // 48 × 0.85 = 40.8
        );
        expect(result.fitting).toEqual(["llama3:70b"]);
    });
});

describe("reputationWeightedPick", () => {
    it("returns null on empty input", () => {
        expect(reputationWeightedPick([])).toBeNull();
        expect(reputationWeightedPick(null)).toBeNull();
    });

    it("returns the only candidate without rolling RNG", () => {
        let called = false;
        const result = reputationWeightedPick([{ id: "a", reputation: 50 }], () => {
            called = true;
            return 0.5;
        });
        expect(result.id).toBe("a");
        expect(called).toBe(false);
    });

    it("higher reputation wins more often (reputation 99 vs 1)", () => {
        const candidates = [
            { id: "high", reputation: 99 },
            { id: "low", reputation: 1 }
        ];
        let highWins = 0;
        const N = 1000;
        let seed = 0;
        // Deterministic LCG so the test isn't flaky.
        const rng = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 0x100000000;
        };
        for (let i = 0; i < N; i++) {
            if (reputationWeightedPick(candidates, rng).id === "high") highWins += 1;
        }
        // Expected ~99% wins for high — give a 5% tolerance.
        expect(highWins / N).toBeGreaterThan(0.94);
        expect(highWins / N).toBeLessThan(1);
    });

    it("zero-reputation provider still has a non-zero chance (floor at 1)", () => {
        // With reputations {0, 50}, weights become {1, 50} (floor at 1).
        // Total = 51 → fresh wins iff rng() ≤ 1/51 ≈ 0.0196. So a forced
        // rng value of 0.01 must select fresh; 0.5 must select veteran.
        const candidates = [
            { id: "fresh", reputation: 0 },
            { id: "veteran", reputation: 50 }
        ];
        expect(reputationWeightedPick(candidates, () => 0.01).id).toBe("fresh");
        expect(reputationWeightedPick(candidates, () => 0.5).id).toBe("veteran");
    });
});
