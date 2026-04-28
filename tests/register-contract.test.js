/**
 * Contract test: the CLI's register payload (as built by
 * apps/cli/commands/register.js → gatherCoarseSpecs) must survive the
 * server's sanitization round-trip without information loss.
 *
 * This test pins the bug fixed in d6b621d (vram_tier='unknown') and
 * future-proofs against the broader class of regressions where the
 * server silently rewrites client-supplied spec fields.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const supabaseState = {
    lookupResult: { data: null, error: null },          // null = no existing row
    upsertCalls: [],
    upsertResult: { data: { id: "row-1", node_id: "provider-abc123" }, error: null }
};

function reset() {
    supabaseState.lookupResult = { data: null, error: null };
    supabaseState.upsertCalls = [];
    supabaseState.upsertResult = { data: { id: "row-1", node_id: "provider-abc123" }, error: null };
}

vi.mock("@/lib/supabase/server", () => ({
    getSupabaseServerClient: () => ({
        from(table) {
            const chain = {
                _table: table,
                _filters: {},
                _upsertPayload: null,
                select() { return chain; },
                eq(col, val) { chain._filters[col] = val; return chain; },
                async maybeSingle() { return supabaseState.lookupResult; },
                upsert(payload) {
                    chain._upsertPayload = payload;
                    supabaseState.upsertCalls.push({ table, payload });
                    return chain;
                },
                async single() { return supabaseState.upsertResult; }
            };
            return chain;
        }
    })
}));

const { registerNode } = await import("@/lib/data/node-api");

/**
 * Faithful reproduction of the payload the CLI sends — see
 * apps/cli/commands/register.js gatherCoarseSpecs(). Pre-classified
 * vram_tier strings, no vram_mb on the wire.
 */
function cliPayloadForRtx5090() {
    return {
        node_id: "provider-abc123",
        name: "test-host",
        address: "203.0.113.42",
        port: 46337,
        gpu_model: "NVIDIA GeForce RTX 5090",
        specs: {
            cpu: { vendor: "amd", arch: "x64", cores: 16, ram_gb: 64, groups: 1 },
            gpu_count: 1,
            gpus: [
                { vendor: "nvidia", vram_tier: "24-48gb", model: "NVIDIA GeForce RTX 5090" }
            ],
            interconnects: {
                nvlink: { available: false, topology: "none", link_count: 0 },
                xgmi: { available: false, topology: "none", link_count: 0 },
                infiniband: { available: false, active_port_count: 0 },
                efa: { available: false, adapter_count: 0 },
                rdma_capable: false
            },
            served_models: ["qwen2.5:7b"]
        }
    };
}

describe("registerNode — CLI payload round-trip contract", () => {
    beforeEach(reset);

    it("preserves vram_tier as sent by the CLI (was downgraded to 'unknown' before d6b621d)", async () => {
        const body = cliPayloadForRtx5090();
        await registerNode({ role: "provider", pubkey: "PK", body });

        expect(supabaseState.upsertCalls).toHaveLength(1);
        const persisted = supabaseState.upsertCalls[0].payload;
        expect(persisted.specs.gpus).toHaveLength(1);
        expect(persisted.specs.gpus[0]).toEqual({
            vendor: "nvidia",
            vram_tier: "24-48gb",
            model: "NVIDIA GeForce RTX 5090"
        });
    });

    it("preserves every standard tier the CLI can send", async () => {
        const tiers = ["<8gb", "8-16gb", "16-24gb", "24-48gb", ">=48gb"];
        for (const tier of tiers) {
            reset();
            const body = cliPayloadForRtx5090();
            body.specs.gpus[0].vram_tier = tier;
            await registerNode({ role: "provider", pubkey: "PK", body });
            const persisted = supabaseState.upsertCalls[0].payload;
            expect(persisted.specs.gpus[0].vram_tier, `tier=${tier}`).toBe(tier);
        }
    });

    it("preserves vendor + model exactly as sent (no sanitization losses)", async () => {
        const body = cliPayloadForRtx5090();
        await registerNode({ role: "provider", pubkey: "PK", body });
        const persisted = supabaseState.upsertCalls[0].payload;
        expect(persisted.specs.gpus[0].vendor).toBe("nvidia");
        expect(persisted.specs.gpus[0].model).toBe("NVIDIA GeForce RTX 5090");
    });

    it("propagates address + port from CLI into the upserted row", async () => {
        const body = cliPayloadForRtx5090();
        body.address = "198.51.100.7";  // simulating Vast.ai PUBLIC_IPADDR after net fix
        body.port = 46337;
        await registerNode({ role: "provider", pubkey: "PK", body });
        const persisted = supabaseState.upsertCalls[0].payload;
        expect(persisted.address).toBe("198.51.100.7");
        expect(persisted.port).toBe(46337);
    });

    it("never persists 'unknown' for a CLI payload that supplied a real tier", async () => {
        // The Vast.ai bug, in one assertion: when the CLI sends a real
        // tier, it must NOT come back as 'unknown' regardless of whether
        // vram_mb was included.
        const body = cliPayloadForRtx5090();
        // Explicitly omit vram_mb (matches what the CLI actually sends).
        delete body.specs.gpus[0].vram_mb;
        await registerNode({ role: "provider", pubkey: "PK", body });
        const persisted = supabaseState.upsertCalls[0].payload;
        expect(persisted.specs.gpus[0].vram_tier).not.toBe("unknown");
    });

    it("falls back to vram_mb-derived tier when the client omits a known tier string", async () => {
        // Defensive: if a future CLI version ever decides to send vram_mb
        // instead of (or alongside) vram_tier, the server should still
        // produce the correct tier.
        const body = cliPayloadForRtx5090();
        body.specs.gpus[0] = { vendor: "nvidia", vram_mb: 32 * 1024, model: "RTX 5090" };
        await registerNode({ role: "provider", pubkey: "PK", body });
        const persisted = supabaseState.upsertCalls[0].payload;
        expect(persisted.specs.gpus[0].vram_tier).toBe("24-48gb");
    });

    it("rejects an unknown vram_tier enum value (defends the privacy boundary)", async () => {
        // Server must validate the enum — a malicious or misbehaving
        // client cannot inject arbitrary strings into the persisted row.
        const body = cliPayloadForRtx5090();
        body.specs.gpus[0].vram_tier = "<script>";
        await registerNode({ role: "provider", pubkey: "PK", body });
        const persisted = supabaseState.upsertCalls[0].payload;
        expect(persisted.specs.gpus[0].vram_tier).toBe("unknown");
    });

    it("403s when an existing row's pubkey doesn't match", async () => {
        supabaseState.lookupResult = { data: { id: "row-1", public_key: "OTHER_PK" }, error: null };
        await expect(
            registerNode({ role: "provider", pubkey: "PK", body: cliPayloadForRtx5090() })
        ).rejects.toMatchObject({ status: 403 });
    });
});
