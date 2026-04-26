import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
    getEnv: () => ({
        supabaseUrl: "https://example.supabase.co",
        supabaseServiceRoleKey: "service-role",
        supabaseSchema: "public",
        pageSize: 25
    })
}));

const fakeSupabaseState = {
    rows: [],
    updates: []
};

vi.mock("@/lib/supabase/server", () => ({
    getSupabaseServerClient: () => ({
        from(table) {
            const ctx = { table };
            const select = {
                select() { return select; },
                eq(col, val) { ctx[col] = val; return select; },
                lte() { return select; },
                order() { return select; },
                limit(n) {
                    ctx.limit = n;
                    return Promise.resolve({ data: fakeSupabaseState.rows.slice(0, n), error: null });
                },
                maybeSingle() {
                    // Used by markRetry to read the current attempts count.
                    // Look up the row by receipt_id if eq() set it.
                    const id = ctx.receipt_id;
                    const found = fakeSupabaseState.rows.find((r) => r.receipt_id === id);
                    return Promise.resolve({
                        data: found ? { attempts: found.attempts ?? 0 } : null,
                        error: null
                    });
                }
            };
            const update = (patch) => {
                const updateChain = {
                    eq(col, val) {
                        fakeSupabaseState.updates.push({ table, col, val, patch });
                        return Promise.resolve({ error: null });
                    }
                };
                return updateChain;
            };
            const insert = () => Promise.resolve({ error: null });
            return {
                ...select,
                select: select.select,
                eq: select.eq,
                lte: select.lte,
                order: select.order,
                limit: select.limit,
                update,
                insert
            };
        }
    })
}));

let savedKey;
beforeEach(() => {
    savedKey = process.env.CPR_ISSUER_API_KEY;
    process.env.CPR_ISSUER_API_KEY = "test-issuer-key";
    fakeSupabaseState.rows = [];
    fakeSupabaseState.updates = [];
});
afterEach(() => {
    if (savedKey !== undefined) process.env.CPR_ISSUER_API_KEY = savedKey;
    else delete process.env.CPR_ISSUER_API_KEY;
});

const { drainPendingReceipts, __testables__ } = await import("@/lib/cpr/queue-drain");

function fakeReceipt(receipt_id) {
    return {
        receipt_id,
        task_id: "j-" + receipt_id,
        agent_did: "did:nostr:" + "a".repeat(64),
        buyer_did: "did:web:infernetprotocol.com:anon:j-" + receipt_id,
        platform_did: "did:web:infernetprotocol.com",
        amount: 0.001,
        currency: "USDC",
        outcome: "accepted"
    };
}

describe("drainPendingReceipts", () => {
    it("returns scanned=0 when the queue is empty", async () => {
        const result = await drainPendingReceipts({ fetchImpl: vi.fn() });
        expect(result.scanned).toBe(0);
        expect(result.sent).toBe(0);
        expect(result.retry).toBe(0);
        expect(result.permanent_fail).toBe(0);
    });

    it("calls fetch once per pending row and counts sent verdicts", async () => {
        fakeSupabaseState.rows = [
            { receipt_id: "r-1", job_id: "j-1", payload: fakeReceipt("r-1"), attempts: 0 },
            { receipt_id: "r-2", job_id: "j-2", payload: fakeReceipt("r-2"), attempts: 1 }
        ];
        const fetchImpl = vi.fn(async () => ({
            ok: true, status: 200, text: async () => `{"ok":true}`
        }));
        const result = await drainPendingReceipts({ fetchImpl });
        expect(result.scanned).toBe(2);
        expect(result.sent).toBe(2);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("counts retry verdicts on 5xx and permanent_fail on 4xx", async () => {
        fakeSupabaseState.rows = [
            { receipt_id: "r-1", job_id: "j-1", payload: fakeReceipt("r-1"), attempts: 0 },
            { receipt_id: "r-2", job_id: "j-2", payload: fakeReceipt("r-2"), attempts: 0 },
            { receipt_id: "r-3", job_id: "j-3", payload: fakeReceipt("r-3"), attempts: 0 }
        ];
        let i = 0;
        const fetchImpl = vi.fn(async () => {
            i += 1;
            if (i === 1) return { ok: true, status: 200, text: async () => "{}" };
            if (i === 2) return { ok: false, status: 503, text: async () => "{}" };
            return { ok: false, status: 422, text: async () => "{}" };
        });
        const result = await drainPendingReceipts({ fetchImpl });
        expect(result.scanned).toBe(3);
        expect(result.sent).toBe(1);
        expect(result.retry).toBe(1);
        expect(result.permanent_fail).toBe(1);
    });

    it("respects batchSize and clamps to MAX", async () => {
        for (let n = 0; n < 200; n += 1) {
            fakeSupabaseState.rows.push({
                receipt_id: "r-" + n,
                job_id: "j-" + n,
                payload: fakeReceipt("r-" + n),
                attempts: 0
            });
        }
        const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, text: async () => "{}" }));
        await drainPendingReceipts({ batchSize: 5, fetchImpl });
        expect(fetchImpl).toHaveBeenCalledTimes(5);

        fakeSupabaseState.updates = [];
        fetchImpl.mockClear();
        await drainPendingReceipts({ batchSize: 9999, fetchImpl });
        expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(__testables__.MAX_BATCH_SIZE);
    });

    it("collects per-row errors without aborting the batch", async () => {
        fakeSupabaseState.rows = [
            { receipt_id: "r-1", job_id: "j-1", payload: fakeReceipt("r-1"), attempts: 0 },
            { receipt_id: "r-2", job_id: "j-2", payload: fakeReceipt("r-2"), attempts: 0 }
        ];
        let i = 0;
        const fetchImpl = vi.fn(async () => {
            i += 1;
            if (i === 1) throw new Error("boom");
            return { ok: true, status: 200, text: async () => "{}" };
        });
        const result = await drainPendingReceipts({ fetchImpl });
        expect(result.scanned).toBe(2);
        // Errors get bookkept on the queue row by tryFlushReceipt's
        // markRetry; from the drain function's perspective the verdict
        // is "pending", so it counts as retry.
        expect(result.sent + result.retry).toBe(2);
    });
});
