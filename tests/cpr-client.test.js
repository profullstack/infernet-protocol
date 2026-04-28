import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    classifyResult,
    getCprBaseUrl,
    getCprIssuerKey,
    isCprConfigured,
    submitReceipt
} from "@/lib/cpr/cpr-client";

describe("CPR client config getters", () => {
    let savedKey, savedBase;
    beforeEach(() => {
        savedKey = process.env.CPR_ISSUER_API_KEY;
        savedBase = process.env.CPR_API_BASE_URL;
    });
    afterEach(() => {
        if (savedKey !== undefined) process.env.CPR_ISSUER_API_KEY = savedKey;
        else delete process.env.CPR_ISSUER_API_KEY;
        if (savedBase !== undefined) process.env.CPR_API_BASE_URL = savedBase;
        else delete process.env.CPR_API_BASE_URL;
    });

    it("isCprConfigured is false when no key is set", () => {
        delete process.env.CPR_ISSUER_API_KEY;
        expect(isCprConfigured()).toBe(false);
    });

    it("isCprConfigured is true when key is set", () => {
        process.env.CPR_ISSUER_API_KEY = "test-key";
        expect(isCprConfigured()).toBe(true);
    });

    it("default base URL is the public CPR endpoint", () => {
        delete process.env.CPR_API_BASE_URL;
        expect(getCprBaseUrl()).toBe("https://coinpayportal.com/api/reputation");
    });

    it("base URL can be overridden via env (e.g. self-host)", () => {
        process.env.CPR_API_BASE_URL = "https://my-cpr.example/api/reputation";
        expect(getCprBaseUrl()).toBe("https://my-cpr.example/api/reputation");
    });
});

describe("classifyResult", () => {
    it("classifies 2xx as sent", () => {
        expect(classifyResult({ ok: true, status: 200 })).toBe("sent");
        expect(classifyResult({ ok: true, status: 201 })).toBe("sent");
    });

    it("classifies 5xx as retry", () => {
        expect(classifyResult({ ok: false, status: 500 })).toBe("retry");
        expect(classifyResult({ ok: false, status: 503 })).toBe("retry");
    });

    it("classifies 408/429 as retry", () => {
        expect(classifyResult({ ok: false, status: 408 })).toBe("retry");
        expect(classifyResult({ ok: false, status: 429 })).toBe("retry");
    });

    it("classifies other 4xx as permanent_fail", () => {
        expect(classifyResult({ ok: false, status: 400 })).toBe("permanent_fail");
        expect(classifyResult({ ok: false, status: 401 })).toBe("permanent_fail");
        expect(classifyResult({ ok: false, status: 404 })).toBe("permanent_fail");
        expect(classifyResult({ ok: false, status: 422 })).toBe("permanent_fail");
    });
});

describe("submitReceipt", () => {
    let savedKey;
    beforeEach(() => {
        savedKey = process.env.CPR_ISSUER_API_KEY;
        process.env.CPR_ISSUER_API_KEY = "test-issuer-key";
    });
    afterEach(() => {
        if (savedKey !== undefined) process.env.CPR_ISSUER_API_KEY = savedKey;
        else delete process.env.CPR_ISSUER_API_KEY;
    });

    it("POSTs to <base>/receipt (singular) with the issuer Bearer token", async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 201,
            text: async () => JSON.stringify({ ok: true })
        }));
        await submitReceipt({ receipt_id: "r-1", task_id: "j-1" }, {
            baseUrl: "https://cpr.example/api/reputation",
            apiKey: "k-1",
            fetchImpl
        });
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe("https://cpr.example/api/reputation/receipt");
        expect(init.method).toBe("POST");
        expect(init.headers.authorization).toBe("Bearer k-1");
        expect(init.headers["content-type"]).toBe("application/json");
        expect(JSON.parse(init.body)).toEqual({ receipt_id: "r-1", task_id: "j-1" });
    });

    it("returns { ok, status, body } on a 2xx", async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 201,
            text: async () => JSON.stringify({ accepted: true })
        }));
        const r = await submitReceipt({ receipt_id: "r-1" }, { fetchImpl });
        expect(r).toEqual({ ok: true, status: 201, body: { accepted: true } });
    });

    it("returns { ok: false, status } on a 4xx (no throw)", async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: false,
            status: 422,
            text: async () => JSON.stringify({ error: "bad shape" })
        }));
        const r = await submitReceipt({ receipt_id: "r-1" }, { fetchImpl });
        expect(r.ok).toBe(false);
        expect(r.status).toBe(422);
        expect(r.body).toEqual({ error: "bad shape" });
    });

    it("throws on network failure", async () => {
        const fetchImpl = vi.fn(async () => { throw new Error("ECONNREFUSED"); });
        await expect(submitReceipt({ receipt_id: "r-1" }, { fetchImpl }))
            .rejects.toThrow(/ECONNREFUSED/);
    });

    it("throws when no issuer key is configured", async () => {
        delete process.env.CPR_ISSUER_API_KEY;
        await expect(submitReceipt({ receipt_id: "r-1" }, {}))
            .rejects.toThrow(/CPR_ISSUER_API_KEY not configured/);
    });

    it("uses the env-configured base URL by default", async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: true, status: 200, text: async () => "{}"
        }));
        await submitReceipt({ receipt_id: "r-1" }, { fetchImpl, apiKey: "k" });
        const [url] = fetchImpl.mock.calls[0];
        expect(url).toMatch(/\/receipt$/);
    });
});
