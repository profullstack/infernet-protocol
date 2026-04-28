import { describe, expect, it, vi, beforeEach } from "vitest";

// Stable secret so we can mint + verify a real bearer the route trusts.
process.env.INFERNET_CLI_SESSION_SECRET = "test-cli-session-secret-bytes-32x";
process.env.NEXT_PUBLIC_APP_URL = "https://example.test";

const { GET } = await import("@/app/api/deploy/cloud-init/route");
const { issueBearer } = await import("@/lib/auth/bearer");

function fakeReq(url) {
    return { url };
}

describe("GET /api/deploy/cloud-init", () => {
    it("serves the script body with text/x-shellscript content-type and no-store cache", async () => {
        const res = await GET(fakeReq("https://example.test/api/deploy/cloud-init"));
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toMatch(/text\/x-shellscript/);
        expect(res.headers.get("cache-control")).toBe("no-store");
        const body = await res.text();
        // POSIX sh — install.sh works under /bin/sh, /bin/bash, /bin/dash.
        expect(body).toMatch(/^#!\/bin\/sh\b/);
        // The route returns the canonical install.sh body — anchor on
        // a stable string that lives in install.sh so we catch
        // accidental drift.
        expect(body).toContain("Infernet Protocol installer");
    });

    it("does NOT inject INFERNET_BEARER when the token is missing", async () => {
        const res = await GET(fakeReq("https://example.test/api/deploy/cloud-init"));
        const body = await res.text();
        expect(body).not.toMatch(/export INFERNET_BEARER=/);
        // CONTROL_PLANE export is always set.
        expect(body).toMatch(/export INFERNET_CONTROL_PLANE=/);
    });

    it("does NOT inject INFERNET_BEARER when the token fails verification", async () => {
        const res = await GET(fakeReq("https://example.test/api/deploy/cloud-init?token=garbage.jwt.value"));
        const body = await res.text();
        expect(body).not.toMatch(/export INFERNET_BEARER=/);
    });

    it("injects INFERNET_BEARER + CONTROL_PLANE when a valid token is presented", async () => {
        const token = issueBearer({
            userId: "user-uuid-abc",
            email: "test@example.com",
            ttlSeconds: 60
        });
        const res = await GET(
            fakeReq(`https://example.test/api/deploy/cloud-init?token=${encodeURIComponent(token)}`)
        );
        const body = await res.text();
        expect(body).toMatch(/export INFERNET_BEARER='/);
        expect(body).toContain(token);
        expect(body).toMatch(/export INFERNET_CONTROL_PLANE=/);
        // Comment annotation includes the user id.
        expect(body).toContain("user-uuid-abc");
    });

    it("injects INFERNET_MODEL when a model query param is provided", async () => {
        const res = await GET(fakeReq("https://example.test/api/deploy/cloud-init?model=qwen2.5%3A0.5b"));
        const body = await res.text();
        expect(body).toMatch(/export INFERNET_MODEL='qwen2.5:0.5b'/);
    });

    it("shell-escapes single quotes in injected env values to prevent injection", async () => {
        // Synthetic token containing a single quote — the shell-quote helper
        // must escape it so the resulting bash is still valid.
        const res = await GET(
            fakeReq("https://example.test/api/deploy/cloud-init?model=" + encodeURIComponent("evil'; rm -rf /"))
        );
        const body = await res.text();
        // The literal single quote should be escaped as '\''
        expect(body).toContain(`export INFERNET_MODEL='evil'\\''; rm -rf /'`);
        // And `rm -rf /` should NOT appear as a top-level command.
        expect(body).not.toMatch(/^rm -rf \//m);
    });
});
