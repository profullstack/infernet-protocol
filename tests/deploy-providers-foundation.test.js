import { describe, expect, it } from "vitest";
import os from "node:os";
import { promises as fs } from "node:fs";
import { join } from "node:path";

import {
    canonicalize,
    aliasesFor,
    matchesCanonical,
    knownGpus
} from "../packages/deploy-providers/src/gpu-normalize.js";
import {
    PRESETS,
    isValidPreset,
    rankOffers,
    costBlock
} from "../packages/deploy-providers/src/pricing.js";
import {
    estimateModelVramGb,
    checkModelFit,
    formatFitWarning
} from "../packages/deploy-providers/src/model-fit.js";
import {
    generateNodeId,
    saveNode,
    loadNode,
    listNodes,
    updateNode
} from "../packages/deploy-providers/src/state.js";
import { DeployProvider, NotSupportedError } from "../packages/deploy-providers/src/providers/base.js";

describe("gpu-normalize", () => {
    it("canonicalizes common aliases to the same key", () => {
        expect(canonicalize("RTX 4090")).toBe("4090");
        expect(canonicalize("rtx-4090")).toBe("4090");
        expect(canonicalize("nvidia-rtx-4090")).toBe("4090");
        expect(canonicalize("4090")).toBe("4090");
    });

    it("returns null for unknown GPU names", () => {
        expect(canonicalize("future-gpu-9999")).toBe(null);
        expect(canonicalize(null)).toBe(null);
        expect(canonicalize("")).toBe(null);
    });

    it("aliasesFor returns provider-native names", () => {
        const a = aliasesFor("h100");
        expect(a.length).toBeGreaterThan(0);
        expect(a.some((x) => x.toLowerCase().includes("h100"))).toBe(true);
    });

    it("matchesCanonical handles cross-form comparison", () => {
        expect(matchesCanonical("4090", "RTX 4090")).toBe(true);
        expect(matchesCanonical("4090", "h100")).toBe(false);
    });

    it("knownGpus includes major families", () => {
        const known = knownGpus();
        expect(known).toContain("4090");
        expect(known).toContain("h100");
        expect(known).toContain("a100-80gb");
    });
});

describe("pricing", () => {
    const offers = [
        { providerId: "runpod",     pricePerHour: 0.40, available: true },
        { providerId: "tensordock", pricePerHour: 0.35, available: true },
        { providerId: "lambda",     pricePerHour: 1.20, available: true },
        { providerId: "runpod",     pricePerHour: 0.30, available: false } // unavailable
    ];

    it("PRESETS contains all four named presets", () => {
        expect(Object.keys(PRESETS).sort()).toEqual(["balanced", "cheap", "production", "reliable"]);
    });

    it("isValidPreset gates correctly", () => {
        expect(isValidPreset("cheap")).toBe(true);
        expect(isValidPreset("nope")).toBe(false);
    });

    it("rankOffers excludes unavailable offers", () => {
        const ranked = rankOffers(offers, "cheap");
        expect(ranked.every((o) => o.available)).toBe(true);
    });

    it("rankOffers respects maxPricePerHour cap", () => {
        const ranked = rankOffers(offers, "cheap", { maxPricePerHour: 0.50 });
        expect(ranked.every((o) => o.pricePerHour <= 0.50)).toBe(true);
        // Lambda at $1.20 was excluded.
        expect(ranked.find((o) => o.providerId === "lambda")).toBeUndefined();
    });

    it("'cheap' preset prefers lowest price", () => {
        const ranked = rankOffers(offers, "cheap");
        expect(ranked[0].pricePerHour).toBe(0.35); // tensordock
    });

    it("'reliable' preset can prefer pricier providers with higher reliability", () => {
        // RunPod (0.40, rel=0.85) vs TensorDock (0.35, rel=0.75).
        // Under 'reliable', the reliability weight (0.45) should
        // outweigh the price gap (0.25 weight).
        const ranked = rankOffers(offers, "reliable");
        expect(ranked[0].providerId).toBe("runpod");
    });

    it("rankOffers throws on unknown preset", () => {
        expect(() => rankOffers(offers, "nope")).toThrow(/unknown pricing preset/);
    });

    it("costBlock formats hourly/daily/monthly", () => {
        const c = costBlock(0.34);
        expect(c.hourly).toBe("$0.34/hr");
        expect(c.daily).toBe("$8.16/day");
        expect(c.monthly).toMatch(/^\$\d+\.\d{2}\/month$/);
    });

    it("costBlock handles invalid input", () => {
        expect(costBlock(NaN).hourly).toBe("?");
        expect(costBlock(-1).hourly).toBe("?");
    });
});

describe("model-fit", () => {
    it("estimates VRAM for known models", () => {
        expect(estimateModelVramGb("Qwen/Qwen2.5-7B-Instruct")).toBeGreaterThan(15);
        expect(estimateModelVramGb("Qwen/Qwen2.5-7B-Instruct")).toBeLessThan(20);
        expect(estimateModelVramGb("meta-llama/Llama-3.1-70B-Instruct")).toBeGreaterThan(150);
    });

    it("returns null for unknown models", () => {
        expect(estimateModelVramGb("future-model-9999")).toBe(null);
    });

    it("AWQ quantization shrinks the estimate", () => {
        const fp16 = estimateModelVramGb("Qwen/Qwen2.5-72B-Instruct");
        const awq = estimateModelVramGb("Qwen/Qwen2.5-72B-Instruct", "awq");
        expect(awq).toBeLessThan(fp16 * 0.5);
    });

    it("checkModelFit reports fits=true for headroom", () => {
        const r = checkModelFit({
            modelId: "Qwen/Qwen2.5-7B-Instruct",
            vramGb: 80,
            gpuCount: 1
        });
        expect(r.fits).toBe(true);
    });

    it("checkModelFit reports fits=false for too-small GPU", () => {
        const r = checkModelFit({
            modelId: "meta-llama/Llama-3.1-70B-Instruct",
            vramGb: 24,
            gpuCount: 1
        });
        expect(r.fits).toBe(false);
        expect(r.recommendations.length).toBeGreaterThan(0);
    });

    it("formatFitWarning returns null when fits", () => {
        const w = formatFitWarning({
            modelId: "Qwen/Qwen2.5-7B-Instruct",
            vramGb: 80,
            gpuCount: 1,
            gpuName: "A100"
        });
        expect(w).toBe(null);
    });

    it("formatFitWarning returns text when too big", () => {
        const w = formatFitWarning({
            modelId: "meta-llama/Llama-3.1-70B-Instruct",
            vramGb: 24,
            gpuCount: 1,
            gpuName: "RTX 4090"
        });
        expect(w).toMatch(/Warning/);
        expect(w).toMatch(/Recommended/);
    });
});

describe("state persistence", () => {
    async function tmpStateDir() {
        const dir = await fs.mkdtemp(join(os.tmpdir(), "inf-deploy-state-"));
        return dir;
    }

    it("generateNodeId returns the expected shape", () => {
        const id = generateNodeId();
        expect(id).toMatch(/^infernet-node-[0-9a-f]{4}$/);
    });

    it("saveNode + loadNode round-trip", async () => {
        const stateDir = await tmpStateDir();
        const record = {
            id: generateNodeId(),
            provider: "runpod",
            providerNodeId: "abc123",
            gpu: "4090",
            gpuCount: 1,
            vramGb: 24,
            engine: "vllm",
            model: "Qwen/Qwen2.5-7B-Instruct",
            hourlyPrice: 0.34,
            status: "creating",
            createdAt: new Date().toISOString(),
            controlPlaneUrl: "https://infernetprotocol.com"
        };
        await saveNode(record, { stateDir });
        const loaded = await loadNode(record.id, { stateDir });
        expect(loaded).toMatchObject(record);
    });

    it("saveNode strips apiKey defensively", async () => {
        const stateDir = await tmpStateDir();
        const id = generateNodeId();
        await saveNode({
            id,
            provider: "runpod",
            apiKey: "SECRET-DO-NOT-PERSIST"
        }, { stateDir });
        const loaded = await loadNode(id, { stateDir });
        expect(loaded.apiKey).toBeUndefined();
    });

    it("listNodes shows the index of saved nodes", async () => {
        const stateDir = await tmpStateDir();
        await saveNode({ id: generateNodeId(), provider: "runpod", status: "running" }, { stateDir });
        await saveNode({ id: generateNodeId(), provider: "lambda", status: "running" }, { stateDir });
        const list = await listNodes({ stateDir });
        expect(list.length).toBe(2);
    });

    it("updateNode patches an existing record", async () => {
        const stateDir = await tmpStateDir();
        const id = generateNodeId();
        await saveNode({ id, provider: "runpod", status: "creating", hourlyPrice: 0.34 }, { stateDir });
        await updateNode(id, { status: "running" }, { stateDir });
        const after = await loadNode(id, { stateDir });
        expect(after.status).toBe("running");
        expect(after.hourlyPrice).toBe(0.34);
    });
});

describe("DeployProvider base class", () => {
    it("requires apiKey + providerId", () => {
        expect(() => new DeployProvider({})).toThrow(/apiKey/);
        expect(() => new DeployProvider({ apiKey: "x" })).toThrow(/providerId/);
    });

    it("constructs with valid config", () => {
        const p = new DeployProvider({ apiKey: "x", providerId: "test" });
        expect(p.providerId).toBe("test");
    });

    it("throws NotSupportedError for un-overridden methods", async () => {
        const p = new DeployProvider({ apiKey: "x", providerId: "test" });
        await expect(p.validateAuth()).rejects.toBeInstanceOf(NotSupportedError);
        await expect(p.createNode({})).rejects.toBeInstanceOf(NotSupportedError);
    });
});
