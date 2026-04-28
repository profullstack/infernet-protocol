import { describe, expect, it } from "vitest";
import { modelFits } from "../apps/cli/commands/setup.js";

describe("modelFits — pre-pull capacity guard", () => {
    it("permits any model when neither VRAM nor RAM is known", () => {
        const r = modelFits({ size_gb: 40, vram_gb: 0, ram_gb: 0 });
        expect(r.fits).toBe(true);
        expect(r.mode).toBe("unknown");
    });

    it("uses GPU mode when any VRAM is reported (85% of VRAM)", () => {
        // 8 GB GPU, 4.4 GB model — 4.4 ≤ 8 × 0.85 = 6.8 → fits
        expect(modelFits({ size_gb: 4.4, vram_gb: 8, ram_gb: 32 }).fits).toBe(true);
        // 8 GB GPU, 9 GB model — 9 > 6.8 → won't fit
        const tight = modelFits({ size_gb: 9, vram_gb: 8, ram_gb: 32 });
        expect(tight.fits).toBe(false);
        expect(tight.mode).toBe("gpu");
        expect(tight.ceiling_gb).toBe(6.8);
    });

    it("multi-GPU sums VRAM (tensor-parallel via Ollama)", () => {
        // 24 + 24 = 48 GB; 48 × 0.85 = 40.8 GB → 40 GB model fits
        expect(modelFits({ size_gb: 40, vram_gb: 48, ram_gb: 64 }).fits).toBe(true);
    });

    it("CPU-only mode uses 60% of RAM ceiling", () => {
        // The literal Renoir-iGPU case: VRAM=0 (or so small we treat
        // as CPU), 6 GB RAM → ceiling 3.6 GB. A 4.4 GB model (qwen2.5:7b)
        // does NOT fit. A 0.4 GB model (qwen2.5:0.5b) does.
        expect(modelFits({ size_gb: 4.4, vram_gb: 0, ram_gb: 6 }).fits).toBe(false);
        expect(modelFits({ size_gb: 0.4, vram_gb: 0, ram_gb: 6 }).fits).toBe(true);
    });

    it("returns the ceiling so callers can show 'GPU ceiling ≈ N GB' in errors", () => {
        const r = modelFits({ size_gb: 9, vram_gb: 8, ram_gb: 0 });
        expect(r.ceiling_gb).toBe(6.8);
        expect(r.mode).toBe("gpu");

        const r2 = modelFits({ size_gb: 9, vram_gb: 0, ram_gb: 6 });
        expect(r2.ceiling_gb).toBe(3.6);
        expect(r2.mode).toBe("cpu");
    });

    it("an invalid size_gb is treated as 'unknown — pass through'", () => {
        for (const bad of [null, undefined, NaN, 0, -1, "string"]) {
            expect(modelFits({ size_gb: bad, vram_gb: 8, ram_gb: 32 }).fits).toBe(true);
        }
    });
});
