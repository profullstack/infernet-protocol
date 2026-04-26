/**
 * Ollama backend — talks to a local Ollama daemon over HTTP.
 *
 * Why this is the recommended default: Ollama already solves model
 * download + cache, multi-vendor GPU (CUDA / ROCm / Metal), the OpenAI-ish
 * chat API, and per-platform installers. We translate its NDJSON
 * `/api/chat` stream into our v1 protocol events.
 *
 * Discovery: `isOllamaReachable()` does a fast probe of `/api/tags`. The
 * factory in `index.js` calls it during auto-selection so a node with
 * Ollama running picks `ollama` automatically; nodes without it fall
 * through to `stub` (or `mojo` if `INFERNET_ENGINE_BIN` is set).
 *
 * Cancellation: each generation owns an AbortController; `cancel()`
 * aborts the in-flight fetch, which surfaces a `done` event with
 * `reason: "cancel"`.
 */

import { randomUUID } from "node:crypto";
import { AsyncQueue } from "../async-queue.js";
import { MSG, PROTOCOL_VERSION } from "../protocol.js";

const DEFAULT_HOST = "http://localhost:11434";
const PROBE_TIMEOUT_MS = 500;

export const OLLAMA_DEFAULT_HOST = DEFAULT_HOST;

export async function isOllamaReachable(host = DEFAULT_HOST, timeoutMs = PROBE_TIMEOUT_MS) {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        const res = await fetch(new URL("/api/tags", host), { signal: ctrl.signal });
        clearTimeout(t);
        return res.ok;
    } catch {
        return false;
    }
}

export async function createOllamaBackend({
    host = process.env.OLLAMA_HOST ?? DEFAULT_HOST,
    defaultModel = process.env.INFERNET_ENGINE_MODEL ?? null,
    skipProbe = false,
    fetchImpl = globalThis.fetch
} = {}) {
    if (!skipProbe) {
        const ok = await isOllamaReachable(host);
        if (!ok) {
            throw new Error(
                `Ollama not reachable at ${host} — install from https://ollama.com or set OLLAMA_HOST`
            );
        }
    }

    return {
        kind: "ollama",
        host,
        generate({ messages, id, model = null, max_tokens, temperature } = {}) {
            const genId = id ?? randomUUID();
            const stream = new AsyncQueue();
            const ctrl = new AbortController();
            const resolvedModel = model ?? defaultModel;

            (async () => {
                if (!resolvedModel) {
                    stream.push({
                        v: PROTOCOL_VERSION,
                        type: MSG.ERROR,
                        id: genId,
                        message:
                            "ollama backend: no model — set INFERNET_ENGINE_MODEL or pass model in the job"
                    });
                    stream.end();
                    return;
                }

                const body = {
                    model: resolvedModel,
                    messages: Array.isArray(messages) ? messages : [],
                    stream: true,
                    options: {}
                };
                if (typeof temperature === "number") body.options.temperature = temperature;
                if (typeof max_tokens === "number") body.options.num_predict = max_tokens;

                let res;
                try {
                    res = await fetchImpl(new URL("/api/chat", host), {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify(body),
                        signal: ctrl.signal
                    });
                } catch (err) {
                    pushTerminal(stream, genId, ctrl, err, "");
                    return;
                }

                if (!res.ok) {
                    let detail = "";
                    try {
                        detail = await res.text();
                    } catch {
                        // best-effort
                    }
                    stream.push({
                        v: PROTOCOL_VERSION,
                        type: MSG.ERROR,
                        id: genId,
                        message: `ollama HTTP ${res.status}: ${detail.slice(0, 200)}`
                    });
                    stream.end();
                    return;
                }

                let metaSent = false;
                let acc = "";
                let buf = "";
                const decoder = new TextDecoder();

                try {
                    for await (const chunk of res.body) {
                        buf += decoder.decode(chunk, { stream: true });
                        let nl;
                        while ((nl = buf.indexOf("\n")) !== -1) {
                            const line = buf.slice(0, nl).trim();
                            buf = buf.slice(nl + 1);
                            if (!line) continue;
                            let parsed;
                            try {
                                parsed = JSON.parse(line);
                            } catch {
                                continue;
                            }

                            if (!metaSent) {
                                stream.push({
                                    v: PROTOCOL_VERSION,
                                    type: MSG.META,
                                    id: genId,
                                    model: parsed.model ?? resolvedModel,
                                    started_at: parsed.created_at ?? new Date().toISOString()
                                });
                                metaSent = true;
                            }

                            const text = parsed?.message?.content ?? "";
                            if (text) {
                                acc += text;
                                stream.push({
                                    v: PROTOCOL_VERSION,
                                    type: MSG.TOKEN,
                                    id: genId,
                                    text
                                });
                            }

                            if (parsed.done) {
                                stream.push({
                                    v: PROTOCOL_VERSION,
                                    type: MSG.DONE,
                                    id: genId,
                                    reason: parsed.done_reason ?? "stop",
                                    text: acc,
                                    finished_at: new Date().toISOString()
                                });
                                stream.end();
                                return;
                            }
                        }
                    }
                    // body ended without a `done:true` chunk — surface as stop.
                    stream.push({
                        v: PROTOCOL_VERSION,
                        type: MSG.DONE,
                        id: genId,
                        reason: "stop",
                        text: acc,
                        finished_at: new Date().toISOString()
                    });
                    stream.end();
                } catch (err) {
                    pushTerminal(stream, genId, ctrl, err, acc);
                }
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
                cancel: () => ctrl.abort()
            };
        },
        async shutdown() {
            // The Ollama daemon is owned by the operator, not by us.
            // Nothing to clean up.
        }
    };
}

function pushTerminal(stream, genId, ctrl, err, accSoFar) {
    if (ctrl.signal.aborted) {
        stream.push({
            v: PROTOCOL_VERSION,
            type: MSG.DONE,
            id: genId,
            reason: "cancel",
            text: accSoFar,
            finished_at: new Date().toISOString()
        });
    } else {
        stream.push({
            v: PROTOCOL_VERSION,
            type: MSG.ERROR,
            id: genId,
            message: err?.message ?? String(err)
        });
    }
    stream.end();
}
