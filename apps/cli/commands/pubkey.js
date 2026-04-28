/**
 * `infernet pubkey link` — claim this node's Nostr pubkey under your
 * Infernet user account, so /dashboard can show "providers I operate".
 *
 * Authenticates with TWO credentials:
 *   - bearer JWT (config.auth.bearerToken) — proves you're the Supabase user
 *   - Nostr signature (config.node.privateKey) — proves you own the pubkey
 *
 * Without both, the link can't safely happen — bearer alone wouldn't
 * prove pubkey control; signature alone wouldn't bind to a user.
 */

import { signRequest, AUTH_HEADER } from "@infernetprotocol/auth";
import { loadConfig } from "../lib/config.js";

const HELP = `infernet pubkey link — bind this node's pubkey to your account

Usage:
  infernet pubkey link [flags]

Flags:
  --role <role>   provider | aggregator | client  (default: from config.node.role)
  --label <name>  Friendly label for this node (defaults to node name)
  --help

After this succeeds, /dashboard will show this provider under your account.
You only need to do it once per (pubkey, role) pair — re-running is a no-op
(or refreshes the label).
`;

const PATH = "/api/v1/user/pubkey/link";

export default async function pubkeyCommand(args) {
    if (args.has("help") || args.has("h")) {
        process.stdout.write(HELP);
        return 0;
    }

    const sub = args.positional?.[0] ?? "link";
    if (sub !== "link") {
        process.stderr.write(`unknown subcommand: ${sub}\n${HELP}`);
        return 2;
    }

    const config = (await loadConfig()) ?? {};
    const baseUrl = config?.controlPlane?.url;
    const bearer = config?.auth?.bearerToken;
    const role = (args.get("role") ?? config?.node?.role ?? "").toLowerCase();
    const label = args.get("label") ?? config?.node?.name ?? null;
    const publicKey = config?.node?.publicKey;
    const privateKey = config?.node?.privateKey;

    if (!baseUrl) {
        process.stderr.write("error: no controlPlane.url. Run `infernet init` first.\n");
        return 1;
    }
    if (!bearer) {
        process.stderr.write("error: not signed in. Run `infernet login` first.\n");
        return 1;
    }
    if (!publicKey || !privateKey) {
        process.stderr.write("error: no node identity. Run `infernet init` first.\n");
        return 1;
    }
    if (!["provider", "aggregator", "client"].includes(role)) {
        process.stderr.write(`error: --role must be provider | aggregator | client (got ${role || "(none)"})\n`);
        return 1;
    }

    const bodyText = JSON.stringify({ role, ...(label ? { label } : {}) });
    const { header } = signRequest({
        method: "POST",
        path: PATH,
        body: bodyText,
        publicKey,
        privateKey
    });

    let res;
    try {
        res = await fetch(new URL(PATH, baseUrl), {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${bearer}`,
                [AUTH_HEADER]: header
            },
            body: bodyText
        });
    } catch (err) {
        process.stderr.write(`error: could not reach ${baseUrl}: ${err?.message ?? err}\n`);
        return 1;
    }

    const text = await res.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { /* ignore */ }

    if (!res.ok) {
        const msg = payload?.error ?? `HTTP ${res.status}`;
        process.stderr.write(`error: link failed — ${msg}\n`);
        return 1;
    }

    const row = payload?.data;
    if (!row) {
        process.stderr.write("error: server response missing data\n");
        return 1;
    }
    process.stdout.write(
        row.created
            ? `✓ linked ${role} pubkey ${publicKey.slice(0, 12)}… to your account\n`
            : `✓ already linked${row.label ? ` (label: ${row.label})` : ""}\n`
    );
    return 0;
}
