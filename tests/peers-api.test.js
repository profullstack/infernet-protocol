import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
    getEnv: () => ({
        supabaseUrl: "https://example.supabase.co",
        supabaseServiceRoleKey: "service-role",
        supabaseSchema: "public",
        pageSize: 25
    })
}));

const queryState = {};

vi.mock("@/lib/supabase/server", () => ({
    getSupabaseServerClient: () => ({
        from: (table) => {
            queryState.table = table;
            queryState.calls = [];
            const chain = {
                select(cols) { queryState.calls.push(["select", cols]); return chain; },
                eq(col, val) { queryState.calls.push(["eq", col, val]); return chain; },
                gte(col, val) { queryState.calls.push(["gte", col, val]); return chain; },
                not(col, op, val) { queryState.calls.push(["not", col, op, val]); return chain; },
                order(col, opts) { queryState.calls.push(["order", col, opts]); return chain; },
                limit(n) {
                    queryState.calls.push(["limit", n]);
                    queryState.lastLimit = n;
                    return Promise.resolve({
                        data: [
                            {
                                public_key: "5d0de683a5f22aa1d5a8927a431d86601277aad61fc7cdce126ac8c012e2c84d",
                                address: "162.250.189.114",
                                port: 46337,
                                gpu_model: "A100",
                                specs: {
                                    gpus: [{ model: "qwen2.5:7b", vendor: "nvidia", vram_tier: "40-80gb" }],
                                    served_models: ["qwen2.5:7b", "llama-3-8b"]
                                },
                                last_seen: "2026-04-26T12:00:00Z"
                            },
                            {
                                public_key: "abc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abc1",
                                address: "2001:db8::1",
                                port: 46337,
                                gpu_model: null,
                                specs: {},
                                last_seen: "2026-04-26T11:55:00Z"
                            }
                        ],
                        error: null
                    });
                }
            };
            return chain;
        }
    })
}));

const { __testables__, listOnlinePeers } = await import("@/lib/data/peers");
const { GET } = await import("@/app/api/peers/route");

describe("listOnlinePeers — data helper", () => {
    it("queries the providers table with status=available and a liveness floor", async () => {
        await listOnlinePeers();
        expect(queryState.table).toBe("providers");
        const eqCalls = queryState.calls.filter((c) => c[0] === "eq");
        expect(eqCalls).toContainEqual(["eq", "status", "available"]);
        const gteCalls = queryState.calls.filter((c) => c[0] === "gte");
        expect(gteCalls.some((c) => c[1] === "last_seen")).toBe(true);
        const notCalls = queryState.calls.filter((c) => c[0] === "not");
        expect(notCalls.some((c) => c[1] === "public_key")).toBe(true);
    });

    it("returns the documented shape per row", async () => {
        const peers = await listOnlinePeers();
        expect(peers).toHaveLength(2);
        for (const p of peers) {
            expect(p).toEqual(
                expect.objectContaining({
                    pubkey: expect.any(String),
                    last_seen: expect.any(String),
                    served_models: expect.any(Array)
                })
            );
            expect(Object.keys(p).sort()).toEqual(
                ["gpu_model", "last_seen", "multiaddr", "pubkey", "served_models"]
            );
        }
    });

    it("builds an ip4 multiaddr for IPv4 addresses", async () => {
        const peers = await listOnlinePeers();
        expect(peers[0].multiaddr).toBe("/ip4/162.250.189.114/tcp/46337");
    });

    it("builds an ip6 multiaddr for IPv6 addresses", async () => {
        const peers = await listOnlinePeers();
        expect(peers[1].multiaddr).toBe("/ip6/2001:db8::1/tcp/46337");
    });

    it("dedupes served_models across specs.gpus[].model and specs.served_models[]", async () => {
        const peers = await listOnlinePeers();
        expect(peers[0].served_models.sort()).toEqual(["llama-3-8b", "qwen2.5:7b"]);
    });

    it("clamps limit to MAX_LIMIT", async () => {
        await listOnlinePeers({ limit: 9999 });
        expect(queryState.lastLimit).toBe(__testables__.MAX_LIMIT);
    });

    it("clamps limit to at least 1", async () => {
        await listOnlinePeers({ limit: 0 });
        expect(queryState.lastLimit).toBe(1);
    });

    it("uses DEFAULT_LIMIT when no limit is passed", async () => {
        await listOnlinePeers();
        expect(queryState.lastLimit).toBe(__testables__.DEFAULT_LIMIT);
    });
});

describe("GET /api/peers — contract", () => {
    function fakeRequest(url) {
        return { url };
    }

    it("responds with { data: [...] } and HTTP 200", async () => {
        const res = await GET(fakeRequest("https://example.com/api/peers"));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty("data");
        expect(Array.isArray(body.data)).toBe(true);
    });

    it("each peer in the response carries pubkey + multiaddr + served_models", async () => {
        const res = await GET(fakeRequest("https://example.com/api/peers"));
        const body = await res.json();
        for (const peer of body.data) {
            expect(peer).toHaveProperty("pubkey");
            expect(peer).toHaveProperty("multiaddr");
            expect(peer).toHaveProperty("served_models");
            expect(peer).toHaveProperty("last_seen");
        }
    });

    it("does NOT leak fields beyond the documented shape", async () => {
        const res = await GET(fakeRequest("https://example.com/api/peers"));
        const body = await res.json();
        const allowedFields = new Set([
            "pubkey", "multiaddr", "last_seen", "served_models", "gpu_model"
        ]);
        for (const peer of body.data) {
            for (const field of Object.keys(peer)) {
                expect(allowedFields.has(field)).toBe(true);
            }
        }
    });

    it("respects the ?limit= query param", async () => {
        await GET(fakeRequest("https://example.com/api/peers?limit=5"));
        expect(queryState.lastLimit).toBe(5);
    });

    it("ignores garbage limit values", async () => {
        await GET(fakeRequest("https://example.com/api/peers?limit=banana"));
        expect(queryState.lastLimit).toBe(__testables__.DEFAULT_LIMIT);
    });
});
