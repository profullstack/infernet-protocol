#!/usr/bin/env node
/**
 * Fake engine for tests and JS-side development.
 *
 * Speaks the same NDJSON v1 protocol as the real Mojo binary, so tests can
 * cover EngineProcess and chat-executor without requiring a Mojo toolchain.
 *
 * Behavior:
 *   - On startup: emit `ready`.
 *   - On `load`:  emit `ready` (acknowledging the load request).
 *   - On `generate`: emit `meta`, then split FAKE_RESPONSE into 3 tokens,
 *     then `done`. Tokens are emitted ~5ms apart so streaming is
 *     observable in tests.
 *   - On `cancel`: emit `done` with reason="cancel" if generation in flight.
 *   - On `shutdown`: exit(0).
 */

import readline from "node:readline";

const PROTOCOL_VERSION = 1;
const FAKE_RESPONSE = process.env.FAKE_RESPONSE ?? "hello world!";
const TOKEN_INTERVAL_MS = Number.parseInt(process.env.FAKE_TOKEN_MS ?? "5", 10);

function send(msg) {
    process.stdout.write(JSON.stringify({ v: PROTOCOL_VERSION, ...msg }) + "\n");
}

const inflight = new Map();

function startGenerate(req) {
    const id = req.id;
    if (!id) return;
    send({ type: "meta", id, model: req.model ?? null, started_at: new Date().toISOString() });

    const tokens = FAKE_RESPONSE.split(/(\s+)/).filter(Boolean);
    let i = 0;
    let acc = "";

    const tick = () => {
        if (!inflight.has(id)) return;
        if (i >= tokens.length) {
            inflight.delete(id);
            send({ type: "done", id, reason: "stop", text: acc });
            return;
        }
        acc += tokens[i];
        send({ type: "token", id, text: tokens[i] });
        i += 1;
        const t = setTimeout(tick, TOKEN_INTERVAL_MS);
        inflight.set(id, { cancel: () => clearTimeout(t) });
    };

    inflight.set(id, { cancel: () => {} });
    setTimeout(tick, TOKEN_INTERVAL_MS);
}

function cancelGenerate(id) {
    const h = inflight.get(id);
    if (!h) return;
    h.cancel();
    inflight.delete(id);
    send({ type: "done", id, reason: "cancel", text: "" });
}

send({ type: "ready", model: process.env.FAKE_MODEL ?? "fake-model" });

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
    let msg;
    try {
        msg = JSON.parse(line);
    } catch {
        return;
    }
    if (msg?.v !== PROTOCOL_VERSION) return;
    switch (msg.type) {
        case "load":
            send({ type: "ready", model: msg.model ?? null });
            break;
        case "generate":
            startGenerate(msg);
            break;
        case "cancel":
            cancelGenerate(msg.id);
            break;
        case "shutdown":
            process.exit(0);
            break;
        default:
            send({ type: "error", message: `unknown type: ${msg.type}` });
    }
});

rl.on("close", () => process.exit(0));
