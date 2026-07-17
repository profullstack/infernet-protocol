import { describe, expect, it } from "vitest";
import { CATALOG } from "../apps/web/lib/model-catalog.js";

// The node decides the backend by hardware: a GPU node serves a model on vLLM
// using its `hf` repo (or a bare `hf:` pull), and falls back to the Ollama
// `pull` tag otherwise. These invariants keep that contract honest.
describe("model catalog", () => {
    it("every entry has an id, name, and a pull identifier", () => {
        for (const m of CATALOG) {
            expect(m.id, JSON.stringify(m)).toBeTruthy();
            expect(m.name, m.id).toBeTruthy();
            expect(typeof m.pull, m.id).toBe("string");
            expect(m.pull.length, m.id).toBeGreaterThan(0);
        }
    });

    it("every vLLM-backed model has a resolvable HF source (hf field or hf: pull)", () => {
        for (const m of CATALOG.filter((x) => x.backend === "vllm")) {
            const hasHfSource = Boolean(m.hf) || m.pull.startsWith("hf:");
            expect(hasHfSource, `${m.id} is backend:vllm but has no hf repo`).toBe(true);
        }
    });

    it("hf repos look like org/name (not an ollama tag)", () => {
        for (const m of CATALOG.filter((x) => x.hf)) {
            expect(m.hf, m.id).toMatch(/^[\w.-]+\/[\w.-]+$/);
            expect(m.hf.includes(":"), `${m.id} hf looks like an ollama tag`).toBe(false);
        }
    });

    it("ids are unique", () => {
        const ids = CATALOG.map((m) => m.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
