import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * IPIP-0003 phase 3 — bearer-token issue + verify for the CLI tier.
 *
 * Tokens are JWTs signed with INFERNET_CLI_SESSION_SECRET (HS256).
 * Issued by /api/auth/cli/poll once a CLI session is authorized;
 * verified by anything under /api/admin/* that wants to scope to a
 * logged-in user.
 *
 * Wrapping Supabase's own session JWT in our own token gives us a
 * CLI-scoped revocation surface independent of the dashboard
 * session — rotating INFERNET_CLI_SESSION_SECRET nukes every
 * outstanding CLI token without touching browser sessions.
 */

const TTL_DAYS = 30;
const ALG = "HS256";

function getSecret() {
    const s = process.env.INFERNET_CLI_SESSION_SECRET;
    if (!s) throw new Error("INFERNET_CLI_SESSION_SECRET is not set");
    return s;
}

function b64urlEncode(input) {
    return Buffer.from(input).toString("base64url");
}

function b64urlDecode(s) {
    return Buffer.from(s, "base64url");
}

function hmac(payload, secret) {
    return createHmac("sha256", secret).update(payload).digest();
}

/**
 * Issue a CLI bearer token.
 * @param {{ userId: string, email?: string|null }} args
 * @returns {string} JWT (HS256)
 */
export function issueBearer({ userId, email = null, ttlSeconds }) {
    if (!userId) throw new Error("issueBearer: userId is required");
    const ttl = Number.isFinite(ttlSeconds) ? ttlSeconds : TTL_DAYS * 86400;
    const now = Math.floor(Date.now() / 1000);
    const header = b64urlEncode(JSON.stringify({ alg: ALG, typ: "JWT" }));
    const payload = b64urlEncode(JSON.stringify({
        sub: userId,
        email,
        iat: now,
        exp: now + ttl,
        scope: "cli"
    }));
    const sig = b64urlEncode(hmac(`${header}.${payload}`, getSecret()));
    return `${header}.${payload}.${sig}`;
}

/**
 * Verify a CLI bearer token. Returns the decoded payload on success,
 * or null on any failure (bad signature, expired, malformed, etc.).
 * Never throws. Constant-time signature comparison.
 *
 * @param {string} token
 * @returns {{ sub:string, email:string|null, iat:number, exp:number, scope?:string }|null}
 */
export function verifyBearer(token) {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts;

    let secret;
    try { secret = getSecret(); }
    catch { return null; }

    const expected = b64urlEncode(hmac(`${header}.${payload}`, secret));
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return null;
    if (!timingSafeEqual(a, b)) return null;

    let parsed;
    try {
        parsed = JSON.parse(b64urlDecode(payload).toString("utf8"));
    } catch {
        return null;
    }
    if (typeof parsed !== "object" || !parsed) return null;
    if (typeof parsed.exp === "number" && Math.floor(Date.now() / 1000) > parsed.exp) {
        return null; // expired
    }
    return parsed;
}

/**
 * Helper: pull a Bearer token out of an Authorization header and
 * verify it. Returns the decoded claims or null.
 */
export function verifyBearerHeader(authorizationHeader) {
    if (!authorizationHeader || typeof authorizationHeader !== "string") return null;
    const m = /^Bearer\s+(\S+)$/.exec(authorizationHeader);
    if (!m) return null;
    return verifyBearer(m[1]);
}

export const __testables__ = { TTL_DAYS, ALG };
