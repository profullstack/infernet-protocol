import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    __testables__,
    buildReceiptBody,
    platformDid,
    partyDid,
    categoryFor,
    canonicalize,
    artifactHashFromEvents,
    outcomeFromJob
} from "@/lib/cpr/receipts";

describe("platformDid", () => {
    let saved;
    beforeEach(() => { saved = process.env.NEXT_PUBLIC_APP_URL; });
    afterEach(() => {
        if (saved !== undefined) process.env.NEXT_PUBLIC_APP_URL = saved;
        else delete process.env.NEXT_PUBLIC_APP_URL;
    });

    it("derives did:web from NEXT_PUBLIC_APP_URL", () => {
        expect(platformDid({ appUrl: "https://infernetprotocol.com" }))
            .toBe("did:web:infernetprotocol.com");
    });

    it("strips trailing slashes and protocol", () => {
        expect(platformDid({ appUrl: "https://acme.example/" }))
            .toBe("did:web:acme.example");
    });

    it("falls back to infernetprotocol.com when no URL is configured", () => {
        delete process.env.NEXT_PUBLIC_APP_URL;
        expect(platformDid()).toBe("did:web:infernetprotocol.com");
    });

    it("works for a self-hosted operator on a different domain", () => {
        expect(platformDid({ appUrl: "https://my-private-cp.local" }))
            .toBe("did:web:my-private-cp.local");
    });
});

describe("partyDid", () => {
    it("formats a hex-64 pubkey as did:nostr:", () => {
        const pk = "5d0de683a5f22aa1d5a8927a431d86601277aad61fc7cdce126ac8c012e2c84d";
        expect(partyDid(pk)).toBe(`did:nostr:${pk}`);
    });

    it("lowercases the hex", () => {
        const pk = "5D0DE683A5F22AA1D5A8927A431D86601277AAD61FC7CDCE126AC8C012E2C84D";
        expect(partyDid(pk)).toBe(`did:nostr:${pk.toLowerCase()}`);
    });

    it("returns a platform-anonymous DID with job id when no pubkey is given", () => {
        const did = partyDid(null, {
            fallbackJobId: "j-123",
            appUrl: "https://infernetprotocol.com"
        });
        expect(did).toBe("did:web:infernetprotocol.com:anon:j-123");
    });

    it("rejects non-hex strings as anonymous", () => {
        const did = partyDid("not-a-pubkey", {
            fallbackJobId: "j-1",
            appUrl: "https://infernetprotocol.com"
        });
        expect(did).toMatch(/:anon:/);
    });
});

describe("categoryFor", () => {
    it("defaults inference to inference:chat", () => {
        expect(categoryFor("inference")).toBe("inference:chat");
    });

    it("appends a subtype when provided", () => {
        expect(categoryFor("inference", "embedding")).toBe("inference:embedding");
    });

    it("lowercases everything", () => {
        expect(categoryFor("TRAINING", "FineTune")).toBe("training:finetune");
    });

    it("falls back to 'inference' when type is missing", () => {
        expect(categoryFor(undefined)).toBe("inference:chat");
    });
});

describe("canonicalize", () => {
    it("sorts keys at every depth", () => {
        const a = { z: 1, a: { d: 4, c: 3 } };
        expect(canonicalize(a)).toBe(`{"a":{"c":3,"d":4},"z":1}`);
    });

    it("drops undefined values", () => {
        expect(canonicalize({ a: 1, b: undefined, c: 2 })).toBe(`{"a":1,"c":2}`);
    });

    it("preserves null", () => {
        expect(canonicalize({ a: null })).toBe(`{"a":null}`);
    });

    it("handles arrays", () => {
        expect(canonicalize([3, 1, 2])).toBe(`[3,1,2]`);
    });

    it("is byte-stable across input key order", () => {
        const a = canonicalize({ x: 1, y: 2, z: 3 });
        const b = canonicalize({ z: 3, y: 2, x: 1 });
        expect(a).toBe(b);
    });
});

describe("artifactHashFromEvents", () => {
    it("hashes the concatenated token text", () => {
        const events = [
            { event_type: "meta", data: {} },
            { event_type: "token", data: { text: "hello " } },
            { event_type: "token", data: { text: "world" } },
            { event_type: "done", data: {} }
        ];
        const h = artifactHashFromEvents(events);
        expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it("is deterministic for the same input", () => {
        const events = [
            { event_type: "token", data: { text: "a" } },
            { event_type: "token", data: { text: "b" } }
        ];
        expect(artifactHashFromEvents(events)).toBe(artifactHashFromEvents(events));
    });

    it("ignores non-token events", () => {
        const a = artifactHashFromEvents([
            { event_type: "meta", data: { foo: "bar" } },
            { event_type: "token", data: { text: "x" } }
        ]);
        const b = artifactHashFromEvents([
            { event_type: "token", data: { text: "x" } }
        ]);
        expect(a).toBe(b);
    });

    it("handles empty events with a stable hash", () => {
        const h = artifactHashFromEvents([]);
        expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
    });
});

describe("outcomeFromJob", () => {
    it("returns accepted for a normal completion", () => {
        expect(outcomeFromJob({ status: "completed" }))
            .toEqual({ outcome: "accepted", dispute: false });
    });

    it("returns rejected for a failed job", () => {
        expect(outcomeFromJob({ status: "failed" }))
            .toEqual({ outcome: "rejected", dispute: false });
    });

    it("returns disputed when the dispute flag is on", () => {
        expect(outcomeFromJob({ status: "completed" }, { disputed: true }))
            .toEqual({ outcome: "disputed", dispute: true });
    });
});

describe("buildReceiptBody", () => {
    const baseArgs = {
        job: {
            id: "11111111-2222-3333-4444-555555555555",
            type: "inference",
            status: "completed",
            payment_offer: "0.034",
            payment_coin: "USDC",
            payment_tx_hash: "tx-abc"
        },
        provider: {
            id: "p-1",
            public_key: "5d0de683a5f22aa1d5a8927a431d86601277aad61fc7cdce126ac8c012e2c84d"
        },
        client: {
            public_key: "abc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abc1"
        },
        events: [{ event_type: "token", data: { text: "ok" } }],
        appUrl: "https://infernetprotocol.com"
    };

    it("produces the documented field set", () => {
        const r = buildReceiptBody(baseArgs);
        const required = [
            "receipt_id", "task_id", "agent_did", "buyer_did", "platform_did",
            "category", "amount", "currency", "escrow_tx", "sla", "outcome",
            "dispute", "artifact_hash", "created_at"
        ];
        for (const key of required) {
            expect(r).toHaveProperty(key);
        }
    });

    it("uses did:web for the platform and did:nostr for parties", () => {
        const r = buildReceiptBody(baseArgs);
        expect(r.platform_did).toBe("did:web:infernetprotocol.com");
        expect(r.agent_did).toMatch(/^did:nostr:[0-9a-f]{64}$/);
        expect(r.buyer_did).toMatch(/^did:nostr:[0-9a-f]{64}$/);
    });

    it("falls back to anonymous buyer DID when client pubkey is missing", () => {
        const args = { ...baseArgs, client: undefined };
        const r = buildReceiptBody(args);
        expect(r.buyer_did).toBe(
            `did:web:infernetprotocol.com:anon:${baseArgs.job.id}`
        );
    });

    it("computes amount as a number, currency as the string from job", () => {
        const r = buildReceiptBody(baseArgs);
        expect(r.amount).toBe(0.034);
        expect(r.currency).toBe("USDC");
    });

    it("derives outcome=accepted for status=completed", () => {
        const r = buildReceiptBody(baseArgs);
        expect(r.outcome).toBe("accepted");
        expect(r.dispute).toBe(false);
    });

    it("derives outcome=rejected for status=failed", () => {
        const r = buildReceiptBody({ ...baseArgs, job: { ...baseArgs.job, status: "failed" } });
        expect(r.outcome).toBe("rejected");
    });

    it("category defaults to inference:chat for type=inference", () => {
        const r = buildReceiptBody(baseArgs);
        expect(r.category).toBe("inference:chat");
    });

    it("computes a sha256 artifact_hash from events", () => {
        const r = buildReceiptBody(baseArgs);
        expect(r.artifact_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it("artifact_hash is null when events are not provided", () => {
        const r = buildReceiptBody({ ...baseArgs, events: undefined });
        expect(r.artifact_hash).toBeNull();
    });

    it("each call generates a new receipt_id", () => {
        const a = buildReceiptBody(baseArgs);
        const b = buildReceiptBody(baseArgs);
        expect(a.receipt_id).not.toBe(b.receipt_id);
    });

    it("throws if job.id is missing", () => {
        expect(() => buildReceiptBody({ ...baseArgs, job: { ...baseArgs.job, id: undefined } }))
            .toThrow(/job\.id is required/);
    });

    it("throws if provider.public_key is missing", () => {
        expect(() => buildReceiptBody({ ...baseArgs, provider: { id: "p-1" } }))
            .toThrow(/provider\.public_key is required/);
    });
});
