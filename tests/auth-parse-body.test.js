import { describe, expect, it } from "vitest";
import { parseAuthBody, wantsRedirect } from "@/lib/auth/parse-body";

function fakeRequest({ contentType, accept, body }) {
    const headers = new Headers();
    if (contentType) headers.set("content-type", contentType);
    if (accept) headers.set("accept", accept);

    if (typeof body === "string") {
        return {
            headers,
            json: async () => JSON.parse(body),
            formData: async () => {
                const form = new URLSearchParams(body);
                const fd = new FormData();
                for (const [k, v] of form) fd.append(k, v);
                return fd;
            }
        };
    }
    if (body && typeof body === "object" && !(body instanceof FormData)) {
        return {
            headers,
            json: async () => body,
            formData: async () => {
                const fd = new FormData();
                for (const [k, v] of Object.entries(body)) fd.append(k, String(v));
                return fd;
            }
        };
    }
    return {
        headers,
        json: async () => ({}),
        formData: async () => new FormData()
    };
}

describe("parseAuthBody", () => {
    it("parses application/json", async () => {
        const r = fakeRequest({
            contentType: "application/json",
            body: JSON.stringify({ email: "x@example.com", password: "abc12345" })
        });
        const out = await parseAuthBody(r);
        expect(out).toEqual({ email: "x@example.com", password: "abc12345" });
    });

    it("returns {} on malformed JSON instead of throwing", async () => {
        const r = {
            headers: new Headers([["content-type", "application/json"]]),
            json: async () => { throw new Error("bad json"); }
        };
        const out = await parseAuthBody(r);
        expect(out).toEqual({});
    });

    it("parses application/x-www-form-urlencoded", async () => {
        const r = fakeRequest({
            contentType: "application/x-www-form-urlencoded",
            body: "email=x%40example.com&password=abc12345"
        });
        const out = await parseAuthBody(r);
        expect(out).toEqual({ email: "x@example.com", password: "abc12345" });
    });

    it("parses multipart/form-data", async () => {
        const r = fakeRequest({
            contentType: "multipart/form-data; boundary=----xyz",
            body: { email: "y@example.com", password: "12345678" }
        });
        const out = await parseAuthBody(r);
        expect(out).toEqual({ email: "y@example.com", password: "12345678" });
    });

    it("returns {} for unknown content types", async () => {
        const r = fakeRequest({ contentType: "text/plain", body: "hello" });
        const out = await parseAuthBody(r);
        expect(out).toEqual({});
    });

    it("returns {} when content-type is absent", async () => {
        const r = fakeRequest({ body: undefined });
        expect(await parseAuthBody(r)).toEqual({});
    });
});

describe("wantsRedirect", () => {
    it("returns false when accept advertises JSON", () => {
        const r = fakeRequest({ accept: "application/json", contentType: "application/json", body: "{}" });
        expect(wantsRedirect(r)).toBe(false);
    });

    it("returns false when content-type is JSON (programmatic POST)", () => {
        const r = fakeRequest({ contentType: "application/json", body: "{}" });
        expect(wantsRedirect(r)).toBe(false);
    });

    it("returns true for an HTML form POST", () => {
        const r = fakeRequest({
            contentType: "application/x-www-form-urlencoded",
            accept: "text/html",
            body: "email=x"
        });
        expect(wantsRedirect(r)).toBe(true);
    });

    it("defaults to true when no accept / content-type are set (browsers omit)", () => {
        const r = fakeRequest({ body: undefined });
        expect(wantsRedirect(r)).toBe(true);
    });
});
