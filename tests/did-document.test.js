import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __testables__, buildDidDocument } from "@/lib/data/did-document";
import { GET } from "@/app/.well-known/did.json/route";

const REAL_KEY = "z6MkifMm6gz5dCXpDBYsCRotCEbWhTbVaR5eoCiyo7fyRjBN";

describe("appUrlToDidHost", () => {
    it("strips https:// and trailing slashes", () => {
        expect(__testables__.appUrlToDidHost("https://infernetprotocol.com/")).toBe("infernetprotocol.com");
    });

    it("strips http:// for local dev", () => {
        expect(__testables__.appUrlToDidHost("http://localhost:3000")).toBe("localhost:3000");
    });

    it("falls back to infernetprotocol.com when no URL is given", () => {
        expect(__testables__.appUrlToDidHost(undefined)).toBe("infernetprotocol.com");
        expect(__testables__.appUrlToDidHost("")).toBe("infernetprotocol.com");
    });

    it("preserves the canonical host even if multiple trailing slashes are passed", () => {
        expect(__testables__.appUrlToDidHost("https://infernetprotocol.com///")).toBe("infernetprotocol.com");
    });
});

describe("buildDidDocument", () => {
    it("produces a did:web id from the app URL", () => {
        const doc = buildDidDocument({
            appUrl: "https://infernetprotocol.com",
            verificationKey: REAL_KEY
        });
        expect(doc.id).toBe("did:web:infernetprotocol.com");
    });

    it("includes a single Ed25519 verification method", () => {
        const doc = buildDidDocument({
            appUrl: "https://infernetprotocol.com",
            verificationKey: REAL_KEY
        });
        expect(doc.verificationMethod).toHaveLength(1);
        expect(doc.verificationMethod[0]).toEqual({
            id: "did:web:infernetprotocol.com#key-1",
            type: "Ed25519VerificationKey2020",
            controller: "did:web:infernetprotocol.com",
            publicKeyMultibase: REAL_KEY
        });
    });

    it("declares the key for both authentication and assertionMethod", () => {
        const doc = buildDidDocument({
            appUrl: "https://infernetprotocol.com",
            verificationKey: REAL_KEY
        });
        expect(doc.authentication).toEqual(["did:web:infernetprotocol.com#key-1"]);
        expect(doc.assertionMethod).toEqual(["did:web:infernetprotocol.com#key-1"]);
    });

    it("publishes a CPRIssuer service entry pointing at /api/cpr", () => {
        const doc = buildDidDocument({
            appUrl: "https://infernetprotocol.com",
            verificationKey: REAL_KEY
        });
        const cpr = doc.service.find((s) => s.type === "CPRIssuer");
        expect(cpr).toBeDefined();
        expect(cpr.serviceEndpoint).toBe("https://infernetprotocol.com/api/cpr");
        expect(cpr.id).toBe("did:web:infernetprotocol.com#cpr");
    });

    it("publishes an InfernetControlPlane service entry pointing at /api/v1", () => {
        const doc = buildDidDocument({
            appUrl: "https://infernetprotocol.com",
            verificationKey: REAL_KEY
        });
        const cp = doc.service.find((s) => s.type === "InfernetControlPlane");
        expect(cp).toBeDefined();
        expect(cp.serviceEndpoint).toBe("https://infernetprotocol.com/api/v1");
    });

    it("works for a self-hosted deployment with a different domain", () => {
        const doc = buildDidDocument({
            appUrl: "https://acme-corp-infernet.com",
            verificationKey: REAL_KEY
        });
        expect(doc.id).toBe("did:web:acme-corp-infernet.com");
        expect(doc.verificationMethod[0].controller).toBe("did:web:acme-corp-infernet.com");
        const cpr = doc.service.find((s) => s.type === "CPRIssuer");
        expect(cpr.serviceEndpoint).toBe("https://acme-corp-infernet.com/api/cpr");
    });

    it("includes the standard DID context", () => {
        const doc = buildDidDocument({ appUrl: "https://infernetprotocol.com", verificationKey: REAL_KEY });
        expect(doc["@context"]).toContain("https://www.w3.org/ns/did/v1");
    });
});

describe("GET /.well-known/did.json — contract", () => {
    let savedAppUrl, savedKey;

    beforeEach(() => {
        savedAppUrl = process.env.NEXT_PUBLIC_APP_URL;
        savedKey = process.env.DID_VERIFICATION_KEY;
        process.env.NEXT_PUBLIC_APP_URL = "https://infernetprotocol.com";
        process.env.DID_VERIFICATION_KEY = REAL_KEY;
    });

    afterEach(() => {
        if (savedAppUrl !== undefined) process.env.NEXT_PUBLIC_APP_URL = savedAppUrl;
        else delete process.env.NEXT_PUBLIC_APP_URL;
        if (savedKey !== undefined) process.env.DID_VERIFICATION_KEY = savedKey;
        else delete process.env.DID_VERIFICATION_KEY;
    });

    it("responds 200 with a JSON DID document", async () => {
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.id).toBe("did:web:infernetprotocol.com");
    });

    it("sets a cache-control header so resolvers can cache", async () => {
        const res = await GET();
        const cache = res.headers.get("cache-control");
        expect(cache).toMatch(/public/);
        expect(cache).toMatch(/max-age=\d+/);
    });

    it("response shape passes the buildDidDocument contract end-to-end", async () => {
        const res = await GET();
        const body = await res.json();
        expect(body).toHaveProperty("@context");
        expect(body).toHaveProperty("id");
        expect(body).toHaveProperty("verificationMethod");
        expect(body).toHaveProperty("authentication");
        expect(body).toHaveProperty("assertionMethod");
        expect(body).toHaveProperty("service");
        expect(Array.isArray(body.verificationMethod)).toBe(true);
        expect(body.verificationMethod[0].type).toBe("Ed25519VerificationKey2020");
    });

    it("uses the configured verification key from env", async () => {
        const res = await GET();
        const body = await res.json();
        expect(body.verificationMethod[0].publicKeyMultibase).toBe(REAL_KEY);
    });
});
