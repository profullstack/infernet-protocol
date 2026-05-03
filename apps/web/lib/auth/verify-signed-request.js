import "server-only";

import {
    verifySignedRequest,
    AUTH_HEADER,
    ReplayCache
} from "@infernetprotocol/auth";

// Per-process replay cache. In a horizontally-scaled deployment this should
// move to a shared store (Redis / Supabase table) — fine for Phase 1.
const replayCache = new ReplayCache();

const ROLE_TABLE = {
    provider: "providers",
    aggregator: "aggregators",
    client: "clients"
};

export function tableForRole(role) {
    return ROLE_TABLE[role];
}

/**
 * Verify a signed request and return `{ pubkey, body }`.
 * `body` is the raw text body that was signed — callers that need JSON
 * should parse it themselves. Throws on any verification failure.
 */
export async function verifySignedNextRequest(request) {
    const header = request.headers.get(AUTH_HEADER);
    if (!header) {
        const err = new Error("missing X-Infernet-Auth header");
        err.status = 401;
        throw err;
    }

    return verifyHeaderAndBody(request, header);
}

/**
 * Optional variant: returns `null` when the request is unsigned, the
 * verified `{ pubkey, body }` when it is signed, and throws (401) when
 * the header is present but invalid. Read routes use this to scope
 * views to an identity without breaking unauthenticated callers.
 */
export async function maybeVerifySignedNextRequest(request) {
    const header = request.headers.get(AUTH_HEADER);
    if (!header) return null;
    return verifyHeaderAndBody(request, header);
}

async function verifyHeaderAndBody(request, header) {

    // We must read the raw body text so its SHA-256 matches what the client
    // signed. `request.text()` consumes the stream.
    const bodyText = await request.text();
    const url = new URL(request.url);
    const path = url.pathname + (url.search ?? "");

    const result = verifySignedRequest({
        method: request.method,
        path,
        body: bodyText,
        headerValue: header
    });

    if (!result.ok) {
        const err = new Error(result.error);
        err.status = 401;
        throw err;
    }

    if (replayCache.has(result.nonce)) {
        const err = new Error("nonce already used");
        err.status = 401;
        throw err;
    }
    replayCache.add(result.nonce);

    return { pubkey: result.pubkey, body: bodyText };
}

export function parseJsonBody(bodyText) {
    if (!bodyText) return {};
    try {
        return JSON.parse(bodyText);
    } catch (err) {
        const e = new Error(`invalid JSON body: ${err.message}`);
        e.status = 400;
        throw e;
    }
}
