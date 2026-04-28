import { describe, expect, it, vi, beforeEach } from "vitest";

process.env.INFERNET_CLI_SESSION_SECRET = "test-cli-session-secret-bytes-32x";

// Track which user owns which pubkey, plus what the route inserts so
// each test can assert specifically.
const ownership = new Map();   // user_id → Set<pubkey>
const insertedCommands = [];

function reset() {
    ownership.clear();
    insertedCommands.length = 0;
}

vi.mock("@/lib/data/node-commands", async (importOriginal) => {
    const orig = await importOriginal();
    return {
        ...orig,
        userOwnsPubkey: async (userId, pubkey) => ownership.get(userId)?.has(pubkey) === true,
        issueCommand: async ({ userId, pubkey, command, args }) => {
            const row = {
                id: `cmd-${insertedCommands.length + 1}`,
                pubkey,
                command,
                args,
                status: "pending",
                issued_by: userId,
                issued_at: new Date().toISOString()
            };
            insertedCommands.push(row);
            return row;
        },
        listCommandsForPubkey: async ({ userId, pubkey }) => {
            // Mirror the real helper's ownership check.
            if (!ownership.get(userId)?.has(pubkey)) {
                const err = new Error("not the owner of that pubkey");
                err.status = 403;
                throw err;
            }
            return insertedCommands.filter((c) => c.pubkey === pubkey);
        }
    };
});

// No real Supabase session in unit tests — driven per-test via a setter.
let mockedUser = null;
vi.mock("@/lib/supabase/auth-server", () => ({
    getCurrentUser: async () => mockedUser
}));

const { POST, GET } = await import("@/app/api/v1/user/nodes/[pubkey]/commands/route");
const { issueBearer } = await import("@/lib/auth/bearer");

function reqWith({ method = "POST", authorization, body, pubkey } = {}) {
    return {
        url: `http://127.0.0.1/api/v1/user/nodes/${pubkey}/commands`,
        method,
        headers: {
            get(name) {
                if (name.toLowerCase() === "authorization") return authorization ?? null;
                return null;
            }
        },
        json: async () => body ?? {}
    };
}

const PUBKEY_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PUBKEY_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("POST /api/v1/user/nodes/<pubkey>/commands — auth + owner check", () => {
    beforeEach(() => { reset(); mockedUser = null; });

    it("rejects unauthenticated callers with 401", async () => {
        const res = await POST(
            reqWith({ pubkey: PUBKEY_A, body: { command: "model_install", args: { model: "x" } } }),
            { params: Promise.resolve({ pubkey: PUBKEY_A }) }
        );
        expect(res.status).toBe(401);
        expect(insertedCommands).toHaveLength(0);
    });

    it("rejects an authed caller who does NOT own the pubkey with 403", async () => {
        ownership.set("user-A", new Set([PUBKEY_A]));
        const bearerB = issueBearer({ userId: "user-B", ttlSeconds: 60 });
        const res = await POST(
            reqWith({
                authorization: `Bearer ${bearerB}`,
                pubkey: PUBKEY_A,
                body: { command: "model_install", args: { model: "qwen2.5:7b" } }
            }),
            { params: Promise.resolve({ pubkey: PUBKEY_A }) }
        );
        expect(res.status).toBe(403);
        expect(insertedCommands).toHaveLength(0);
    });

    it("queues the command for the rightful owner with 200", async () => {
        ownership.set("user-A", new Set([PUBKEY_A]));
        const bearerA = issueBearer({ userId: "user-A", ttlSeconds: 60 });
        const res = await POST(
            reqWith({
                authorization: `Bearer ${bearerA}`,
                pubkey: PUBKEY_A,
                body: { command: "model_install", args: { model: "qwen2.5:7b" } }
            }),
            { params: Promise.resolve({ pubkey: PUBKEY_A }) }
        );
        expect(res.status).toBe(200);
        expect(insertedCommands).toHaveLength(1);
        expect(insertedCommands[0]).toMatchObject({
            issued_by: "user-A",
            pubkey: PUBKEY_A,
            command: "model_install",
            args: { model: "qwen2.5:7b" }
        });
    });

    it("session-cookie auth (browser /dashboard) works the same as bearer", async () => {
        ownership.set("user-cookie", new Set([PUBKEY_A]));
        mockedUser = { id: "user-cookie", email: "browser@example.com" };
        const res = await POST(
            reqWith({
                pubkey: PUBKEY_A,
                body: { command: "model_install", args: { model: "qwen2.5:7b" } }
            }),
            { params: Promise.resolve({ pubkey: PUBKEY_A }) }
        );
        expect(res.status).toBe(200);
        expect(insertedCommands[0].issued_by).toBe("user-cookie");
    });

    it("rejects unknown command verbs with 400 (no DB write)", async () => {
        ownership.set("user-A", new Set([PUBKEY_A]));
        const bearerA = issueBearer({ userId: "user-A", ttlSeconds: 60 });
        const res = await POST(
            reqWith({
                authorization: `Bearer ${bearerA}`,
                pubkey: PUBKEY_A,
                body: { command: "rm -rf /", args: {} }
            }),
            { params: Promise.resolve({ pubkey: PUBKEY_A }) }
        );
        expect(res.status).toBe(400);
        expect(insertedCommands).toHaveLength(0);
    });

    it("rejects model_install with empty / oversized args.model with 400", async () => {
        ownership.set("user-A", new Set([PUBKEY_A]));
        const bearerA = issueBearer({ userId: "user-A", ttlSeconds: 60 });
        for (const model of ["", "   ", "x".repeat(257)]) {
            const res = await POST(
                reqWith({
                    authorization: `Bearer ${bearerA}`,
                    pubkey: PUBKEY_A,
                    body: { command: "model_install", args: { model } }
                }),
                { params: Promise.resolve({ pubkey: PUBKEY_A }) }
            );
            expect(res.status).toBe(400);
        }
        expect(insertedCommands).toHaveLength(0);
    });

    it("two users with different pubkeys can't see each other's commands", async () => {
        ownership.set("user-A", new Set([PUBKEY_A]));
        ownership.set("user-B", new Set([PUBKEY_B]));
        // A queues something for their own node.
        await POST(
            reqWith({
                authorization: `Bearer ${issueBearer({ userId: "user-A", ttlSeconds: 60 })}`,
                pubkey: PUBKEY_A,
                body: { command: "model_install", args: { model: "qwen2.5:7b" } }
            }),
            { params: Promise.resolve({ pubkey: PUBKEY_A }) }
        );

        // B tries to LIST A's commands — must 403.
        const res = await GET(
            { url: `http://127.0.0.1/api/v1/user/nodes/${PUBKEY_A}/commands?limit=10`, method: "GET",
              headers: { get(n){ return n.toLowerCase() === "authorization"
                                  ? `Bearer ${issueBearer({ userId: "user-B", ttlSeconds: 60 })}`
                                  : null; } } },
            { params: Promise.resolve({ pubkey: PUBKEY_A }) }
        );
        expect(res.status).toBe(403);
    });
});
