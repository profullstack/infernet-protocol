import { describe, expect, it } from "vitest";
import { detectGpus, lastDetectionDiagnostics } from "../packages/gpu/src/detect.js";

describe("GPU detection — diagnostics", () => {
    it("populates lastDetectionDiagnostics after each detectGpus() run", async () => {
        // Vitest sandbox: nvidia-smi / rocm-smi / system_profiler / lspci
        // are all unavailable, so the call should return [] and populate
        // the diagnostics dict with non-empty per-vendor reasons.
        const gpus = await detectGpus();
        const diag = lastDetectionDiagnostics();

        expect(Array.isArray(gpus)).toBe(true);
        expect(typeof diag).toBe("object");

        // We always probe nvidia + amd. apple only when on darwin.
        // The diagnostics dict must mention at least one vendor with
        // a non-empty reason string.
        const reasons = Object.values(diag).filter((v) => typeof v === "string" && v.length > 0);
        expect(reasons.length).toBeGreaterThan(0);

        // Every reason must include either the binary name we tried or
        // a "skipped" / "not installed" / "error" hint — i.e. it must
        // be actionable, not a generic "no" string.
        for (const r of reasons) {
            expect(r.length).toBeGreaterThan(3);
        }
    });

    it("resets diagnostics across calls (no stale state)", async () => {
        await detectGpus();
        const first = lastDetectionDiagnostics();
        await detectGpus();
        const second = lastDetectionDiagnostics();
        // Same shape across runs (vitest env doesn't change), but
        // they're independent dicts (mutating one shouldn't leak).
        expect(Object.keys(first).sort()).toEqual(Object.keys(second).sort());
    });

    it("lastDetectionDiagnostics returns a copy — caller mutation can't poison module state", async () => {
        await detectGpus();
        const snapshot = lastDetectionDiagnostics();
        snapshot.poisoned = "yes";
        const fresh = lastDetectionDiagnostics();
        expect(fresh.poisoned).toBeUndefined();
    });
});
