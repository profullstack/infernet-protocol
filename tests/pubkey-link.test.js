import { describe, expect, it, vi, beforeEach } from "vitest";
import { generateKeyPair, signRequest, AUTH_HEADER } from "@infernetprotocol/auth";

process.env.INFERNET_CLI_SESSION_SECRET = "test-cli-session-secret-bytes-32x";

// Track every Supabase call so each test can assert + override per-call results.
const supabaseState = {
    lookupResult: { data: null, error: null },
    insertResult: { data: null, error: null },
    updateCalls: [],
    insertCalls: []
};

function resetSupabase() {
    supabaseState.lookupResult = { data: null, error: null };
    supabaseState.insertResult = { data: null, error: null };
    supabaseState.updateCalls = [];
    supabaseState.insertCalls = [];
}

vi.mock("@/lib/supabase/server", () => ({
    getSupabaseServerClient: () => ({
        from(table) {
            const chain = {
                _table: table,
                _filters: {},
                _patch: null,
                _insert: null,
                select() { return chain; },
                eq(col, val) { chain._filters[col] = val; return chain; },
                async maybeSingle() { return supabaseState.lookupResult; },
                update(patch) { chain._patch = patch; return chain; },
                insert(row) { chain._insert = row; return chain; },
                async single() {
                    if (chain._insert) {
                        supabaseState.insertCalls.push({ table, row: chain._insert });
                        return supabaseState.insertResult;
                    }
                    return { data: null, error: null };
                },
                // The route calls `await supabase.from(...).update(patch).eq("id", id)`
                // which resolves the chain itself (no terminal). Make `then` work:
                then(onF, onR) {
                    if (chain._patch) {
                        supabaseState.updateCalls.push({ table, patch: chain._patch, filters: chain._filters });
                    }
                    return Promise.resolve({ data: null, error: null }).then(onF, onR);
                }
            };
            return chain;
        }
    })
}));

const { POST } = await import("@/app/api/v1/user/pubkey/link/route");
const { issueBearer } = await import("@/lib/auth/bearer");

const PATH = "/api/v1/user/pubkey/link";

function makeReq({ bearerUserId, body, omitSignature = false } = {}) {
    const bodyText = JSON.stringify(body ?? {});
    const keys = generateKeyPair();
    const { header } = signRequest({ method: "POST", path: PATH, body: bodyText, ...keys });
    const headers = {
        "content-type": "application/json"
    };
    if (bearerUserId) {
        headers["authorization"] = `Bearer ${issueBearer({ userId: bearerUserId, ttlSeconds: 60 })}`;
    }
    if (!omitSignature) {
        headers[AUTH_HEADER] = header;
    }
    return {
        request: new Request(`http://127.0.0.1${PATH}`, { method: "POST", body: bodyText, headers }),
        pubkey: keys.publicKey.toLowerCase()
    };
}

describe("POST /api/v1/user/pubkey/link", () => {
    beforeEach(resetSupabase);

    it("rejects unauthenticated requests with 401", async () => {
        const { request } = makeReq({ body: { role: "provider" } });
        const res = await POST(request);
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error).toMatch(/bearer/i);
    });

    it("rejects requests missing the signed-request header with 401", async () => {
        const { request } = makeReq({ bearerUserId: "user-A", body: { role: "provider" }, omitSignature: true });
        const res = await POST(request);
        expect(res.status).toBe(401);
    });

    it("rejects invalid roles with 400", async () => {
        const { request } = makeReq({ bearerUserId: "user-A", body: { role: "totally-fake" } });
        const res = await POST(request);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/role must be/);
    });

    it("creates a new pubkey_links row when none exists for (pubkey, role)", async () => {
        supabaseState.lookupResult = { data: null, error: null };
        supabaseState.insertResult = {
            data: { id: "row-1", user_id: "user-A", pubkey: "...", role: "provider", label: "node-1", created_at: "now" },
            error: null
        };

        const { request, pubkey } = makeReq({
            bearerUserId: "user-A",
            body: { role: "provider", label: "node-1" }
        });
        const res = await POST(request);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.data.created).toBe(true);
        expect(supabaseState.insertCalls).toHaveLength(1);
        expect(supabaseState.insertCalls[0].table).toBe("pubkey_links");
        expect(supabaseState.insertCalls[0].row.user_id).toBe("user-A");
        expect(supabaseState.insertCalls[0].row.role).toBe("provider");
        expect(supabaseState.insertCalls[0].row.pubkey).toBe(pubkey);
        expect(supabaseState.insertCalls[0].row.label).toBe("node-1");
    });

    it("returns 409 when (pubkey, role) is already claimed by a different user", async () => {
        supabaseState.lookupResult = {
            data: { id: "row-9", user_id: "OTHER-USER", label: "owned-elsewhere" },
            error: null
        };

        const { request } = makeReq({ bearerUserId: "user-A", body: { role: "provider" } });
        const res = await POST(request);
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.error).toMatch(/already linked/i);
        // No insert should have happened.
        expect(supabaseState.insertCalls).toHaveLength(0);
    });

    it("refreshes the label (no insert) when the same user re-claims with a new label", async () => {
        supabaseState.lookupResult = {
            data: { id: "row-7", user_id: "user-A", label: "old-name" },
            error: null
        };

        const { request } = makeReq({
            bearerUserId: "user-A",
            body: { role: "provider", label: "new-name" }
        });
        const res = await POST(request);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.data.created).toBe(false);
        expect(body.data.label).toBe("new-name");
        // Update path runs; insert path doesn't.
        expect(supabaseState.updateCalls).toHaveLength(1);
        expect(supabaseState.updateCalls[0].patch).toEqual({ label: "new-name" });
        expect(supabaseState.insertCalls).toHaveLength(0);
    });
});
