import { describe, expect, it } from "vitest";
import {
    generateKeyPair,
    derivePublicKey,
    keyPairIsValid,
    signMessage,
    verifyMessage,
    signRequest,
    verifySignedRequest,
    parseAuthHeader,
    ReplayCache,
    isHex64
} from "@infernetprotocol/auth";

describe("keys", () => {
    it("generates a valid secp256k1/Schnorr keypair", () => {
        const { publicKey, privateKey } = generateKeyPair();
        expect(isHex64(publicKey)).toBe(true);
        expect(isHex64(privateKey)).toBe(true);
        expect(keyPairIsValid(publicKey, privateKey)).toBe(true);
    });

    it("derives the same pubkey for the same privkey", () => {
        const { publicKey, privateKey } = generateKeyPair();
        expect(derivePublicKey(privateKey)).toBe(publicKey);
    });

    it("rejects mismatched keypairs", () => {
        const a = generateKeyPair();
        const b = generateKeyPair();
        expect(keyPairIsValid(a.publicKey, b.privateKey)).toBe(false);
    });
});

describe("sig", () => {
    it("signs + verifies an arbitrary message", () => {
        const { publicKey, privateKey } = generateKeyPair();
        const sig = signMessage("hello infernet", privateKey);
        expect(sig).toMatch(/^[0-9a-f]{128}$/);
        expect(verifyMessage("hello infernet", sig, publicKey)).toBe(true);
    });

    it("rejects a tampered message", () => {
        const { publicKey, privateKey } = generateKeyPair();
        const sig = signMessage("hello", privateKey);
        expect(verifyMessage("hello!", sig, publicKey)).toBe(false);
    });

    it("rejects a signature from a different key", () => {
        const a = generateKeyPair();
        const b = generateKeyPair();
        const sig = signMessage("payload", a.privateKey);
        expect(verifyMessage("payload", sig, b.publicKey)).toBe(false);
    });
});

describe("signed-request", () => {
    const method = "POST";
    const path = "/api/v1/node/heartbeat";
    const body = JSON.stringify({ last_seen: "2026-04-19T00:00:00Z" });

    it("round-trips a signed request", () => {
        const keys = generateKeyPair();
        const { header } = signRequest({ method, path, body, ...keys });
        const parsed = parseAuthHeader(header);
        expect(parsed.pubkey).toBe(keys.publicKey.toLowerCase());

        const result = verifySignedRequest({ method, path, body, headerValue: header });
        expect(result.ok).toBe(true);
        expect(result.pubkey).toBe(keys.publicKey.toLowerCase());
    });

    it("fails when the body is tampered with", () => {
        const keys = generateKeyPair();
        const { header } = signRequest({ method, path, body, ...keys });
        const result = verifySignedRequest({
            method,
            path,
            body: body.replace("2026", "2027"),
            headerValue: header
        });
        expect(result.ok).toBe(false);
    });

    it("fails when the method or path is changed", () => {
        const keys = generateKeyPair();
        const { header } = signRequest({ method, path, body, ...keys });
        expect(verifySignedRequest({ method: "DELETE", path, body, headerValue: header }).ok).toBe(false);
        expect(verifySignedRequest({ method, path: path + "x", body, headerValue: header }).ok).toBe(false);
    });

    it("rejects stale timestamps", () => {
        const keys = generateKeyPair();
        const { header } = signRequest({ method, path, body, ...keys });
        const future = Math.floor(Date.now() / 1000) + 3600;
        const result = verifySignedRequest({ method, path, body, headerValue: header, now: future });
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/replay window/);
    });

    it("replay cache rejects a reused nonce", () => {
        const cache = new ReplayCache();
        const keys = generateKeyPair();
        const { header } = signRequest({ method, path, body, ...keys });
        const first = verifySignedRequest({ method, path, body, headerValue: header });
        expect(first.ok).toBe(true);
        expect(cache.has(first.nonce)).toBe(false);
        cache.add(first.nonce);
        expect(cache.has(first.nonce)).toBe(true);
    });
});
