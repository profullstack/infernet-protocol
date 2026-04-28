import { describe, expect, it, vi } from "vitest";
import {
    validateKeyFormat,
    classifyAuthProbe,
    __testables__
} from "../tooling/cpr-canary.mjs";

describe("validateKeyFormat", () => {
    it("accepts a well-formed cprt_<name>_<hex> key", () => {
        const r = validateKeyFormat("cprt_Infernet_2ba3aae81176d6d66e55682077eb677b");
        expect(r.ok).toBe(true);
    });

    it("accepts a longer hex tail", () => {
        const r = validateKeyFormat("cprt_Infernet_2ba3aae81176d6d66e55682077eb677bcf2dc4582a806761");
        expect(r.ok).toBe(true);
    });

    it("rejects empty / unset", () => {
        expect(validateKeyFormat(null)).toEqual({ ok: false, reason: "empty" });
        expect(validateKeyFormat("")).toEqual({ ok: false, reason: "empty" });
        expect(validateKeyFormat(undefined)).toEqual({ ok: false, reason: "empty" });
    });

    it("rejects a JWT-shaped string", () => {
        const r = validateKeyFormat("eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiYWJjIn0.signature");
        expect(r.ok).toBe(false);
        expect(r.reason).toBe("format");
    });

    it("rejects garbage", () => {
        expect(validateKeyFormat("hello world").ok).toBe(false);
        expect(validateKeyFormat("cprt_").ok).toBe(false);
        expect(validateKeyFormat("cprt_Infernet_").ok).toBe(false);
        expect(validateKeyFormat("cprt_Infernet_NOT_HEX_HERE").ok).toBe(false);
    });

    it("allows letters/digits/dots/hyphens/underscores in the name slot", () => {
        expect(validateKeyFormat("cprt_b1dz_2ba3aae81176d6d66e55682077eb677b").ok).toBe(true);
        expect(validateKeyFormat("cprt_my-platform_2ba3aae81176d6d66e55682077eb677b").ok).toBe(true);
        expect(validateKeyFormat("cprt_my.platform_2ba3aae81176d6d66e55682077eb677b").ok).toBe(true);
    });
});

describe("classifyAuthProbe", () => {
    it("treats 401/403 as auth_rejected", () => {
        expect(classifyAuthProbe(401)).toBe("auth_rejected");
        expect(classifyAuthProbe(403)).toBe("auth_rejected");
    });

    it("treats other 4xx as auth_ok_body_rejected (the success case)", () => {
        expect(classifyAuthProbe(400)).toBe("auth_ok_body_rejected");
        expect(classifyAuthProbe(404)).toBe("auth_ok_body_rejected");
        expect(classifyAuthProbe(409)).toBe("auth_ok_body_rejected");
        expect(classifyAuthProbe(422)).toBe("auth_ok_body_rejected");
    });

    it("treats 5xx as server_error", () => {
        expect(classifyAuthProbe(500)).toBe("server_error");
        expect(classifyAuthProbe(503)).toBe("server_error");
    });

    it("treats status=0 as network failure", () => {
        expect(classifyAuthProbe(0)).toBe("network");
    });

    it("treats unexpected 2xx as auth_ok_unexpected_2xx", () => {
        expect(classifyAuthProbe(200)).toBe("auth_ok_unexpected_2xx");
        expect(classifyAuthProbe(201)).toBe("auth_ok_unexpected_2xx");
    });

    it("returns 'unknown' for anything outside known ranges", () => {
        expect(classifyAuthProbe(304)).toBe("unknown");
    });
});

describe("authProbe", () => {
    it("POSTs to <base>/receipt with the issuer Bearer token and a canary body", async () => {
        const fetchImpl = vi.fn(async () => ({ status: 422 }));
        const r = await __testables__.authProbe(
            "https://coinpayportal.com/api/reputation",
            "cprt_Test_abc123",
            fetchImpl
        );
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe("https://coinpayportal.com/api/reputation/receipt");
        expect(init.method).toBe("POST");
        expect(init.headers.authorization).toBe("Bearer cprt_Test_abc123");
        expect(JSON.parse(init.body)).toEqual({ canary: true });
        expect(r.status).toBe(422);
    });

    it("returns status=0 + error on network failure", async () => {
        const fetchImpl = vi.fn(async () => { throw new Error("ENOTFOUND"); });
        const r = await __testables__.authProbe(
            "https://invalid.example",
            "cprt_Test_abc",
            fetchImpl
        );
        expect(r.status).toBe(0);
        expect(r.error).toMatch(/ENOTFOUND/);
    });

    it("strips trailing slashes from base url", async () => {
        const fetchImpl = vi.fn(async () => ({ status: 422 }));
        await __testables__.authProbe(
            "https://example.com/api/reputation/",
            "cprt_Test_abc",
            fetchImpl
        );
        const [url] = fetchImpl.mock.calls[0];
        expect(url).toBe("https://example.com/api/reputation/receipt");
    });
});
