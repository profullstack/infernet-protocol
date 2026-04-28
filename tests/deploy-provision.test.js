import { describe, expect, it } from "vitest";

process.env.INFERNET_CLI_SESSION_SECRET = "test-cli-session-secret-bytes-32x";
process.env.NEXT_PUBLIC_APP_URL = "https://example.test";

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
    it("rejects unauthenticated requests with 401", async () => {
        const res = await POST(fakeReq());
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error).toMatch(/not signed in|log in/i);
    });

    it("rejects garbage bearer with 401", async () => {
        const res = await POST(fakeReq({ authorization: "Bearer not.a.real.jwt" }));
        expect(res.status).toBe(401);
    });

    it("mints a fresh 24h bearer for the authenticated user", async () => {
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

        // Round-trip: minted token verifies, carries the same userId, has a 24h TTL.
        const minted = verifyBearer(body.data.token);
        expect(minted).not.toBeNull();
        expect(minted.sub).toBe("user-uuid-abc");
        expect(minted.exp - before).toBeGreaterThanOrEqual(24 * 60 * 60 - 5);
        expect(minted.exp - after).toBeLessThanOrEqual(24 * 60 * 60 + 5);
    });

    it("issued deploy token is independent of the caller's bearer (different signature)", async () => {
        const userBearer = issueBearer({ userId: "user-uuid-xyz", ttlSeconds: 30 * 86400 });
        const res = await POST(fakeReq({ authorization: `Bearer ${userBearer}` }));
        const body = await res.json();
        // Different exp => different payload => different signature.
        expect(body.data.token).not.toBe(userBearer);
    });
});
