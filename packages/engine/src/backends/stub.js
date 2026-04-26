/**
 * Stub backend — produces canned tokens in-process, no child binary.
 *
 * This is the baseline so the daemon works on every box without a Mojo
 * toolchain. It speaks the same async-iterator interface as the Mojo
 * backend, so callers (e.g. chat-executor) are backend-agnostic.
 *
 * The token stream is the same one the daemon shipped before the engine
 * abstraction landed — keeping observable behavior unchanged when no real
 * engine is configured.
 */

import { randomUUID } from "node:crypto";
import { AsyncQueue } from "../async-queue.js";
import { MSG, PROTOCOL_VERSION } from "../protocol.js";

const STUB_RESPONSE_TEMPLATE = (input) =>
    [
        `Running on the Infernet P2P network.`,
        `You said: "${String(input).slice(0, 200)}"`,
        `This is a stub response from the provider daemon — no real model is running yet.`,
        `When a real engine (Mojo + MAX) is wired in, tokens will stream from actual inference.`
    ].join(" ");

function lastUserMessage(messages) {
    if (!Array.isArray(messages)) return "";
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const m = messages[i];
        if (m?.role === "user" && typeof m.content === "string") return m.content;
    }
    return "";
}

export async function createStubBackend({ tokenDelayMs = 60 } = {}) {
    return {
        kind: "stub",
        generate({ messages, id, model = null } = {}) {
            const genId = id ?? randomUUID();
            const stream = new AsyncQueue();
            const userText = lastUserMessage(messages);
            const fullText = STUB_RESPONSE_TEMPLATE(userText);
            const tokens = fullText.split(/(\s+)/).filter(Boolean);

            (async () => {
                stream.push({
                    v: PROTOCOL_VERSION,
                    type: MSG.META,
                    id: genId,
                    model,
                    started_at: new Date().toISOString()
                });

                let acc = "";
                for (const tok of tokens) {
                    if (stream.closed) return;
                    acc += tok;
                    stream.push({
                        v: PROTOCOL_VERSION,
                        type: MSG.TOKEN,
                        id: genId,
                        text: tok
                    });
                    const jitter = Math.floor(Math.random() * tokenDelayMs);
                    await new Promise((r) => setTimeout(r, tokenDelayMs + jitter));
                }

                stream.push({
                    v: PROTOCOL_VERSION,
                    type: MSG.DONE,
                    id: genId,
                    reason: "stop",
                    text: acc,
                    finished_at: new Date().toISOString()
                });
                stream.end();
            })().catch((err) => {
                stream.push({
                    v: PROTOCOL_VERSION,
                    type: MSG.ERROR,
                    id: genId,
                    message: err?.message ?? String(err)
                });
                stream.end();
            });

            return {
                id: genId,
                stream,
                cancel: () => stream.end()
            };
        },
        async shutdown() {
            // nothing to clean up
        }
    };
}
