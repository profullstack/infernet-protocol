import { describe, expect, it, vi, beforeEach } from "vitest";

process.env.INFERNET_CLI_SESSION_SECRET = "test-cli-session-secret-bytes-32x";
process.env.NEXT_PUBLIC_APP_URL = "https://example.test";

// Mock the Supabase session helper so we can drive the cookie-auth
// path independently of any real cookies.
let mockedUser = null;
vi.mock("@/lib/supabase/auth-server", () => ({
    getCurrentUser: async () => mockedUser,
    getSupabaseAuthClient: async () => null
}));

const { POST } = await import("@/app/api/v1/user/deploy/provision/route");
const { issueBearer, verifyBearer } = await import("@/lib/auth/bearer");

function fakeReq({ authorization } = {}) {
    return {
        headers: {
            get(name) {
                if (name.toLowerCase() === "authorization") return authorization ?? null;
                return null;
            }
        }
    };
}

describe("POST /api/v1/user/deploy/provision", () => {
    beforeEach(() => { mockedUser = null; });

    it("rejects unauthenticated requests (no bearer, no session) with 401", async () => {
        const res = await POST(fakeReq());
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error).toMatch(/not signed in|sign in/i);
    });

    it("rejects garbage bearer + no session cookie with 401", async () => {
        const res = await POST(fakeReq({ authorization: "Bearer not.a.real.jwt" }));
        expect(res.status).toBe(401);
    });

    it("mints a fresh 24h bearer when authenticated via CLI bearer", async () => {
        const userBearer = issueBearer({
            userId: "user-uuid-abc",
            email: "user@example.com",
            ttlSeconds: 30 * 86400
        });
        const before = Math.floor(Date.now() / 1000);
        const res = await POST(fakeReq({ authorization: `Bearer ${userBearer}` }));
        const after = Math.floor(Date.now() / 1000);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.data.token).toBeTypeOf("string");
        expect(body.data.ttl_seconds).toBe(24 * 60 * 60);
        expect(body.data.expires_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(body.data.cloud_init_url).toContain("/api/deploy/cloud-init?token=");
        expect(body.data.cloud_init_url).toContain(encodeURIComponent(body.data.token));

        const minted = verifyBearer(body.data.token);
        expect(minted).not.toBeNull();
        expect(minted.sub).toBe("user-uuid-abc");
        expect(minted.exp - before).toBeGreaterThanOrEqual(24 * 60 * 60 - 5);
        expect(minted.exp - after).toBeLessThanOrEqual(24 * 60 * 60 + 5);
    });

    it("falls back to Supabase session cookie when no Authorization header (browser /deploy path)", async () => {
        mockedUser = { id: "user-uuid-from-cookie", email: "browser@example.com" };
        const res = await POST(fakeReq());
        expect(res.status).toBe(200);
        const body = await res.json();
        const minted = verifyBearer(body.data.token);
        expect(minted.sub).toBe("user-uuid-from-cookie");
        expect(minted.email).toBe("browser@example.com");
    });

    it("CLI bearer takes priority over session cookie when both are present", async () => {
        mockedUser = { id: "from-cookie", email: "cookie@example.com" };
        const userBearer = issueBearer({
            userId: "from-bearer",
            email: "bearer@example.com",
            ttlSeconds: 30 * 86400
        });
        const res = await POST(fakeReq({ authorization: `Bearer ${userBearer}` }));
        const body = await res.json();
        const minted = verifyBearer(body.data.token);
        expect(minted.sub).toBe("from-bearer");
    });

    it("issued deploy token is independent of the caller's bearer (different signature)", async () => {
        const userBearer = issueBearer({ userId: "user-uuid-xyz", ttlSeconds: 30 * 86400 });
        const res = await POST(fakeReq({ authorization: `Bearer ${userBearer}` }));
        const body = await res.json();
        expect(body.data.token).not.toBe(userBearer);
    });
});
