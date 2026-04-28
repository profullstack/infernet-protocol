/**
 * `infernet debug` — one command that dumps everything you'd want to
 * paste into a bug report or support chat. Bundles:
 *
 *   - CLI version + control-plane commit + timestamp
 *   - Sanitized config (bearer tokens + private keys redacted)
 *   - Daemon status + stats (uptime, heartbeat counters, last error)
 *   - Last 60 lines of the daemon log
 *   - Local Ollama state (models pulled, version)
 *   - Control-plane "self" row from /api/v1/node/me (signed)
 *   - This node's entry in /api/peers (last_seen, served_models, etc.)
 *   - `infernet doctor --skip-e2e` summary
 *
 * Sensitive values redacted:
 *   - auth.bearerToken
 *   - node.privateKey
 *   - public IP + port (the daemon advertises these on the network so
 *     they're not really secret, but we redact anyway because someone
 *     pasting `infernet debug` in a public chat may not realize)
 */

import fs from "node:fs/promises";
import { getDaemonLogPath, getConfigPath, loadConfig } from "../lib/config.js";
import { isDaemonAlive, sendToDaemon } from "../lib/ipc.js";
import { createNodeClient } from "../lib/node-client.js";
import doctor from "./doctor.js";

const HELP = `infernet debug — dump diagnostic bundle for support / bug reports

Usage:
  infernet debug [flags]

Flags:
  --no-redact      Don't redact tokens / private keys / public address.
                   Use ONLY when sharing privately. Default: redact.
  --log-lines <n>  Daemon log tail size (default 60).
  --help

What it does:
  Runs every diagnostic at once and prints a single Markdown-formatted
  bundle you can copy-paste into a bug report. Sensitive values are
  redacted by default. Nothing is uploaded — output is local stdout.
`;

const REDACTED = "<redacted>";

function section(title) {
    process.stdout.write(`\n## ${title}\n\n`);
}

function codeBlock(lang, body) {
    process.stdout.write("```");
    process.stdout.write(lang ?? "");
    process.stdout.write("\n");
    process.stdout.write(body.replace(/\n$/, ""));
    process.stdout.write("\n```\n");
}

function jsonBlock(obj) {
    codeBlock("json", JSON.stringify(obj, null, 2));
}

function sanitizeConfig(cfg, redact) {
    if (!cfg) return cfg;
    if (!redact) return cfg;
    const out = JSON.parse(JSON.stringify(cfg));
    if (out.auth?.bearerToken) out.auth.bearerToken = REDACTED;
    if (out.node?.privateKey) out.node.privateKey = REDACTED;
    if (out.node?.address) out.node.address = REDACTED;
    if (typeof out.node?.port === "number") out.node.port = "<redacted>";
    return out;
}

async function probeHealth(baseUrl) {
    if (!baseUrl) return { error: "no controlPlane.url in config" };
    try {
        const res = await fetch(new URL("/api/health", baseUrl), {
            signal: AbortSignal.timeout?.(5000)
        });
        if (!res.ok) return { http: res.status };
        return await res.json();
    } catch (err) {
        return { error: err?.message ?? String(err) };
    }
}

async function probeOllama(host) {
    if (!host) return { error: "no engine.ollamaHost in config" };
    try {
        const res = await fetch(new URL("/api/tags", host), {
            signal: AbortSignal.timeout?.(3000)
        });
        if (!res.ok) return { http: res.status };
        const json = await res.json();
        return {
            models: (json.models ?? []).map((m) => ({
                name: m.name ?? m.model,
                size_gb: typeof m.size === "number" ? +(m.size / 1024 / 1024 / 1024).toFixed(2) : null
            }))
        };
    } catch (err) {
        return { error: err?.message ?? String(err) };
    }
}

async function probeSelfRow(config) {
    if (!config?.controlPlane?.url || !config?.node?.publicKey) {
        return { skipped: "no control-plane URL or pubkey in config" };
    }
    try {
        const client = createNodeClient({
            url: config.controlPlane.url,
            publicKey: config.node.publicKey,
            privateKey: config.node.privateKey,
            role: config.node.role ?? "provider",
            timeoutMs: 5000
        });
        const resp = await client.me();
        return resp?.row ?? { row: null };
    } catch (err) {
        return { error: err?.message ?? String(err), status: err?.status };
    }
}

async function probePeerEntry(config) {
    if (!config?.controlPlane?.url || !config?.node?.publicKey) {
        return { skipped: "no control-plane URL or pubkey" };
    }
    try {
        const res = await fetch(
            new URL("/api/peers?limit=100", config.controlPlane.url),
            { signal: AbortSignal.timeout?.(5000) }
        );
        if (!res.ok) return { http: res.status };
        const body = await res.json();
        const me = (body.data ?? []).find((p) => p.pubkey === config.node.publicKey);
        return me ?? { not_in_peer_list: true, total_peers: (body.data ?? []).length };
    } catch (err) {
        return { error: err?.message ?? String(err) };
    }
}

async function probeDaemonSnapshot() {
    const alive = await isDaemonAlive(500);
    if (!alive) return { running: false };
    try {
        const reply = await sendToDaemon({ kind: "snapshot" }, 1500);
        return { running: true, snapshot: reply };
    } catch (err) {
        return { running: true, error: err?.message ?? String(err) };
    }
}

async function tailLog(path, n) {
    try {
        const text = await fs.readFile(path, "utf8");
        const lines = text.split("\n");
        return lines.slice(-n).join("\n");
    } catch (err) {
        return `(no log at ${path}: ${err?.message ?? err})`;
    }
}

export default async function debugCommand(args) {
    if (args.has("help") || args.has("h")) {
        process.stdout.write(HELP);
        return 0;
    }

    const redact = !args.has("no-redact");
    const logLines = Number.parseInt(args.get("log-lines") ?? "60", 10) || 60;

    const config = (await loadConfig()) ?? {};
    const baseUrl = config?.controlPlane?.url ?? null;

    process.stdout.write(`# infernet debug bundle\n`);
    process.stdout.write(`generated: ${new Date().toISOString()}\n`);
    process.stdout.write(`config:    ${getConfigPath()}\n`);
    process.stdout.write(`redacted:  ${redact ? "yes (use --no-redact in private channels)" : "NO — values are visible"}\n`);

    section("Control plane");
    jsonBlock(await probeHealth(baseUrl));

    section("Local config (sanitized)");
    jsonBlock(sanitizeConfig(config, redact));

    section("Daemon snapshot");
    jsonBlock(await probeDaemonSnapshot());

    section("Daemon log (last " + logLines + " lines)");
    codeBlock("", await tailLog(getDaemonLogPath(), logLines));

    section("Local Ollama");
    jsonBlock(await probeOllama(config?.engine?.ollamaHost));

    section("Self row on control plane (signed /api/v1/node/me)");
    jsonBlock(await probeSelfRow(config));

    section("Self entry in /api/peers");
    jsonBlock(await probePeerEntry(config));

    section("Doctor (skip-e2e, json)");
    process.stdout.write("```\n");
    // Re-use doctor with --skip-e2e --json so the bundle stays parseable.
    const fakeArgs = {
        positional: [],
        flags: new Map([["skip-e2e", true], ["json", true]]),
        has(name) { return this.flags.has(name); },
        get(name) { const v = this.flags.get(name); return v === true ? undefined : v; }
    };
    try {
        await doctor(fakeArgs);
    } catch (err) {
        process.stdout.write(`doctor threw: ${err?.message ?? err}\n`);
    }
    process.stdout.write("```\n");

    process.stdout.write(`\n---\nEnd of bundle. Paste this into a bug report or support chat.\n`);
    return 0;
}

export { HELP };
