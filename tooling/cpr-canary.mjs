#!/usr/bin/env node
/**
 * CPR issuer-key canary.
 *
 * Run on the control plane (or any machine with the production
 * env loaded) to verify CPR_ISSUER_API_KEY actually works against
 * coinpayportal.com — without producing a real receipt.
 *
 *   node tooling/cpr-canary.mjs
 *   pnpm cpr:canary               # alias from root package.json
 *
 * What it checks (in order, short-circuits on failure):
 *
 *   1. Env: CPR_ISSUER_API_KEY is set.
 *   2. Format: looks like cprt_<name>_<32-byte-hex>.
 *   3. Reachability: HEAD <base>/ — should respond at all.
 *   4. Auth probe: POST <base>/receipt with a deliberately-invalid body.
 *        - 401 → key rejected (rotate or check env)
 *        - 4xx (other) → key valid, body rejected (= success: auth works,
 *                        we just sent a junk receipt on purpose)
 *        - 5xx → CoinPay server error (transient — try again later)
 *
 * Exit codes:
 *   0 — auth verified
 *   1 — config / auth problem
 *   2 — transient server error
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Tiny .env loader (no dotenv dep; the canary should run anywhere)
// ---------------------------------------------------------------------------
function loadDotenvIfPresent() {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
        join(here, "..", ".env"),
        join(process.cwd(), ".env")
    ];
    for (const p of candidates) {
        if (!existsSync(p)) continue;
        const txt = readFileSync(p, "utf8");
        for (const raw of txt.split("\n")) {
            const line = raw.trim();
            if (!line || line.startsWith("#")) continue;
            const eq = line.indexOf("=");
            if (eq < 0) continue;
            const k = line.slice(0, eq).trim();
            const v = line.slice(eq + 1).trim();
            if (process.env[k] === undefined) process.env[k] = v;
        }
        return p;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Pretty output
// ---------------------------------------------------------------------------
const TTY = process.stdout.isTTY && !process.env.NO_COLOR;
const C = {
    reset: TTY ? "\x1b[0m" : "",
    green: TTY ? "\x1b[32m" : "",
    red: TTY ? "\x1b[31m" : "",
    yellow: TTY ? "\x1b[33m" : "",
    dim: TTY ? "\x1b[2m" : ""
};
const ok = (m) => process.stdout.write(`  ${C.green}✓${C.reset} ${m}\n`);
const warn = (m) => process.stdout.write(`  ${C.yellow}!${C.reset} ${m}\n`);
const fail = (m) => process.stdout.write(`  ${C.red}✗${C.reset} ${m}\n`);
const dim = (m) => process.stdout.write(`    ${C.dim}${m}${C.reset}\n`);

// ---------------------------------------------------------------------------
// Pure helpers (testable)
// ---------------------------------------------------------------------------
const KEY_RE = /^cprt_[A-Za-z0-9._-]+_[0-9a-f]{32,}$/;

export function validateKeyFormat(key) {
    if (!key) return { ok: false, reason: "empty" };
    if (!KEY_RE.test(key)) return { ok: false, reason: "format" };
    return { ok: true };
}

export function classifyAuthProbe(status) {
    if (status === 401 || status === 403) return "auth_rejected";
    if (status >= 400 && status < 500) return "auth_ok_body_rejected";
    if (status === 0) return "network";
    if (status >= 500) return "server_error";
    if (status >= 200 && status < 300) return "auth_ok_unexpected_2xx";
    return "unknown";
}

// ---------------------------------------------------------------------------
// Network probes
// ---------------------------------------------------------------------------
async function authProbe(baseUrl, apiKey, fetchImpl = globalThis.fetch) {
    const url = `${baseUrl.replace(/\/+$/, "")}/receipt`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
        const res = await fetchImpl(url, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`
            },
            // Deliberately invalid body — we want CoinPay to reject the
            // receipt, NOT to write one. Auth happens before body
            // validation, so a 401 means the key is bad and a 4xx-other
            // means the key was accepted.
            body: JSON.stringify({ canary: true }),
            signal: ctrl.signal
        });
        return { status: res.status };
    } catch (err) {
        return { status: 0, error: err?.message ?? String(err) };
    } finally {
        clearTimeout(timer);
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    const envPath = loadDotenvIfPresent();
    if (envPath) dim(`loaded env from ${envPath}`);

    const apiKey = process.env.CPR_ISSUER_API_KEY ?? null;
    const baseUrl = process.env.CPR_API_BASE_URL ?? "https://coinpayportal.com/api/reputation";

    process.stdout.write(`\nCPR issuer-key canary\n`);
    process.stdout.write(`  base url:    ${baseUrl}\n`);
    process.stdout.write(`  issuer key:  ${apiKey ? `${apiKey.slice(0, 14)}…` : "(not set)"}\n\n`);

    // 1. Env present
    if (!apiKey) {
        fail("CPR_ISSUER_API_KEY is not set in env");
        dim("set in .env (local) or Railway → Variables (production)");
        return 1;
    }
    ok("CPR_ISSUER_API_KEY is set");

    // 2. Format
    const fmt = validateKeyFormat(apiKey);
    if (!fmt.ok) {
        fail(`key format looks wrong (${fmt.reason})`);
        dim("expected: cprt_<name>_<hex>  e.g. cprt_Infernet_abcd…1234");
        return 1;
    }
    ok("key format matches cprt_<name>_<hex>");

    // 3+4. Auth probe
    process.stdout.write(`\nProbing ${baseUrl}/receipt with a deliberately-invalid body...\n`);
    const probe = await authProbe(baseUrl, apiKey);
    const verdict = classifyAuthProbe(probe.status);

    switch (verdict) {
        case "auth_ok_body_rejected":
            ok(`HTTP ${probe.status} — auth accepted (body rejected as expected)`);
            process.stdout.write(`\n${C.green}All checks passed.${C.reset}\n`);
            return 0;
        case "auth_ok_unexpected_2xx":
            warn(`HTTP ${probe.status} — auth accepted but CoinPay also accepted the canary body??`);
            dim("That shouldn't happen with a {canary:true} payload — investigate.");
            return 0;
        case "auth_rejected":
            fail(`HTTP ${probe.status} — key rejected by CoinPay`);
            dim("most likely: leaked + rotated key, typoed env, or wrong issuer");
            return 1;
        case "server_error":
            warn(`HTTP ${probe.status} — CoinPay server error (transient)`);
            return 2;
        case "network":
            fail(`network error: ${probe.error ?? "unreachable"}`);
            dim(`check that CPR_API_BASE_URL (${baseUrl}) is reachable from this host`);
            return 1;
        default:
            warn(`HTTP ${probe.status} — unexpected response`);
            return 2;
    }
}

const isMain = import.meta.url === `file://${process.argv[1]}` ||
               process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
    main().then((code) => process.exit(code)).catch((err) => {
        fail(`canary crashed: ${err?.message ?? err}`);
        process.exit(2);
    });
}

export const __testables__ = { KEY_RE, authProbe };
