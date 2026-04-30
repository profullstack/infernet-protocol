/**
 * Tests for IPIP-0028 Phase 1 per-model keypair management.
 *
 * We mock config.js so tests don't touch the real ~/.config/infernet/config.json.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Build an in-memory config store shared across the mock.
let _config = {};
vi.mock("../apps/cli/lib/config.js", () => ({
    loadConfig: vi.fn(async () => ({ ..._config })),
    saveConfig: vi.fn(async (c) => { _config = { ...c }; })
}));

const { getOrCreateModelKey, getModelPublicKeys, getModelKeyPair } =
    await import("../apps/cli/lib/model-key.js");

beforeEach(() => {
    _config = {};
    vi.clearAllMocks();
});

describe("getOrCreateModelKey", () => {
    it("returns null for falsy model name", async () => {
        expect(await getOrCreateModelKey("")).toBeNull();
        expect(await getOrCreateModelKey(null)).toBeNull();
    });

    it("generates a new keypair and persists it", async () => {
        const kp = await getOrCreateModelKey("qwen2.5:7b");
        expect(kp).not.toBeNull();
        expect(typeof kp.publicKey).toBe("string");
        expect(typeof kp.privateKey).toBe("string");
        expect(kp.publicKey).toHaveLength(64);  // x-only hex
        expect(kp.privateKey).toHaveLength(64);

        // Persisted in the in-memory config store.
        expect(_config.engine?.model_keys?.["qwen2.5:7b"]).toEqual(kp);
    });

    it("returns the same keypair on subsequent calls (idempotent)", async () => {
        const kp1 = await getOrCreateModelKey("qwen2.5:7b");
        const kp2 = await getOrCreateModelKey("qwen2.5:7b");
        expect(kp1.publicKey).toBe(kp2.publicKey);
        expect(kp1.privateKey).toBe(kp2.privateKey);
    });

    it("generates independent keypairs for different models", async () => {
        const kpA = await getOrCreateModelKey("qwen2.5:7b");
        const kpB = await getOrCreateModelKey("qwen2.5:0.5b");
        expect(kpA.publicKey).not.toBe(kpB.publicKey);
        expect(kpA.privateKey).not.toBe(kpB.privateKey);
    });

    it("does not overwrite an existing keypair", async () => {
        const original = await getOrCreateModelKey("qwen2.5:7b");
        // Calling again should NOT generate a new one.
        const again = await getOrCreateModelKey("qwen2.5:7b");
        expect(again.publicKey).toBe(original.publicKey);
    });
});

describe("getModelPublicKeys", () => {
    it("returns empty object when no keys have been generated", async () => {
        expect(await getModelPublicKeys()).toEqual({});
    });

    it("returns all model public keys by name", async () => {
        await getOrCreateModelKey("qwen2.5:7b");
        await getOrCreateModelKey("qwen2.5:0.5b");
        const keys = await getModelPublicKeys();
        expect(Object.keys(keys).sort()).toEqual(["qwen2.5:0.5b", "qwen2.5:7b"]);
        expect(typeof keys["qwen2.5:7b"]).toBe("string");
        expect(keys["qwen2.5:7b"]).toHaveLength(64);
    });
});

describe("getModelKeyPair", () => {
    it("returns null for unknown model", async () => {
        expect(await getModelKeyPair("no-such-model")).toBeNull();
    });

    it("returns the stored keypair for a known model", async () => {
        const kp = await getOrCreateModelKey("qwen2.5:7b");
        const fetched = await getModelKeyPair("qwen2.5:7b");
        expect(fetched).toEqual(kp);
    });

    it("returns null for falsy input", async () => {
        expect(await getModelKeyPair(null)).toBeNull();
        expect(await getModelKeyPair("")).toBeNull();
    });
});
