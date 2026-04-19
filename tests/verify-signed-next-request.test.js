/**
 * Integration test for the Next.js verifier wrapper. It consumes a real
 * `Request` object (the global constructor on modern Node) so we catch
 * mistakes in header name, body read, or URL parsing.
 */
import { describe, expect, it } from "vitest";

import { generateKeyPair, signRequest, AUTH_HEADER } from "@infernetprotocol/auth";

// Avoid pulling in `server-only` by not using the "@" alias here.
import { verifySignedNextRequest } from "../apps/web/lib/auth/verify-signed-request.js";

function makeRequest({ method = "POST", path, body, header }) {
    const url = `http://127.0.0.1${path}`;
    const req = new Request(url, {
        method,
        body: method === "GET" ? undefined : body,
        headers: header ? { [AUTH_HEADER]: header } : {}
    });
    return req;
}

describe("verifySignedNextRequest", () => {
    const method = "POST";
    const path = "/api/v1/node/heartbeat";
    const body = JSON.stringify({ role: "provider" });

    it("accepts a valid signed request", async () => {
        const keys = generateKeyPair();
        const { header } = signRequest({ method, path, body, ...keys });
        const req = makeRequest({ method, path, body, header });
        const result = await verifySignedNextRequest(req);
        expect(result.pubkey).toBe(keys.publicKey.toLowerCase());
        expect(result.body).toBe(body);
    });

    it("rejects missing header with 401", async () => {
        const req = makeRequest({ method, path, body });
        await expect(verifySignedNextRequest(req)).rejects.toMatchObject({
            status: 401,
            message: /missing X-Infernet-Auth/
        });
    });

    it("rejects tampered body with 401", async () => {
        const keys = generateKeyPair();
        const { header } = signRequest({ method, path, body, ...keys });
        const req = makeRequest({ method, path, body: body.replace("provider", "client"), header });
        await expect(verifySignedNextRequest(req)).rejects.toMatchObject({ status: 401 });
    });

    it("rejects reused nonce with 401", async () => {
        const keys = generateKeyPair();
        const { header } = signRequest({ method, path, body, ...keys });
        const reqA = makeRequest({ method, path, body, header });
        const reqB = makeRequest({ method, path, body, header });
        await expect(verifySignedNextRequest(reqA)).resolves.toBeDefined();
        await expect(verifySignedNextRequest(reqB)).rejects.toMatchObject({
            status: 401,
            message: /nonce already used/
        });
    });
});
