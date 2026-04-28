/**
 * vLLM backend — talks to a local vLLM server over HTTP using the
 * OpenAI-compatible chat completions endpoint.
 *
 * Why this exists alongside the Ollama backend: vLLM is the high-throughput
 * serving engine of choice for serious GPU operators (PagedAttention,
 * tensor + pipeline parallelism via Ray, request batching). Ollama wins on
 * "just works on any GPU + CPU + Apple Silicon"; vLLM wins on throughput
 * and on serving big models that don't fit on one GPU. Operators pick
 * whichever fits their hardware — we speak both.
 *
 * Discovery: `isVllmReachable()` does a fast probe of `/v1/models`. The
 * factory in `index.js` calls it during auto-selection so a node with
 * vLLM running picks `vllm` automatically; nodes without it fall through
 * to `ollama` (or `stub`).
 *
 * Streaming: vLLM uses OpenAI-style Server-Sent Events — each line is
 * `data: {...}` JSON, terminated by `data: [DONE]`. We translate that
 * into our v1 protocol events.
 *
 * Cancellation: each generation owns an AbortController; `cancel()`
 * aborts the in-flight fetch, which surfaces a `done` event with
 * `reason: "cancel"`.
 */

import { randomUUID } from "node:crypto";
import { AsyncQueue } from "../async-queue.js";
import { MSG, PROTOCOL_VERSION } from "../protocol.js";

const DEFAULT_HOST = "http://localhost:8000";
const PROBE_TIMEOUT_MS = 500;

export const VLLM_DEFAULT_HOST = DEFAULT_HOST;

export async function isVllmReachable(host = DEFAULT_HOST, timeoutMs = PROBE_TIMEOUT_MS) {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        const res = await fetch(new URL("/v1/models", host), { signal: ctrl.signal });
        clearTimeout(t);
        return res.ok;
    } catch {
        return false;
    }
}

export async function createVllmBackend({
    host = process.env.VLLM_HOST ?? DEFAULT_HOST,
    apiKey = process.env.VLLM_API_KEY ?? null,
    defaultModel = process.env.VLLM_MODEL ?? process.env.INFERNET_ENGINE_MODEL ?? null,
    skipProbe = false,
    fetchImpl = globalThis.fetch
} = {}) {
    if (!skipProbe) {
        const ok = await isVllmReachable(host);
        if (!ok) {
            throw new Error(
                `vLLM not reachable at ${host} — start with 'vllm serve <model>' or set VLLM_HOST`
            );
        }
    }

    return {
        kind: "vllm",
        host,
        hasApiKey: Boolean(apiKey),
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
                            "vllm backend: no model — set VLLM_MODEL or pass model in the job"
                    });
                    stream.end();
                    return;
                }

                const body = {
                    model: resolvedModel,
                    messages: Array.isArray(messages) ? messages : [],
                    stream: true
                };
                if (typeof temperature === "number") body.temperature = temperature;
                if (typeof max_tokens === "number") body.max_tokens = max_tokens;

                const headers = { "content-type": "application/json" };
                if (apiKey) headers["authorization"] = `Bearer ${apiKey}`;

                let res;
                try {
                    res = await fetchImpl(new URL("/v1/chat/completions", host), {
                        method: "POST",
                        headers,
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
                        message: `vllm HTTP ${res.status}: ${detail.slice(0, 200)}`
                    });
                    stream.end();
                    return;
                }

                let metaSent = false;
                let acc = "";
                let buf = "";
                let finishReason = null;
                const decoder = new TextDecoder();

                try {
                    for await (const chunk of res.body) {
                        buf += decoder.decode(chunk, { stream: true });
                        let nl;
                        while ((nl = buf.indexOf("\n")) !== -1) {
                            const rawLine = buf.slice(0, nl);
                            buf = buf.slice(nl + 1);
                            const line = rawLine.trim();
                            if (!line || !line.startsWith("data:")) continue;
                            const payload = line.slice("data:".length).trim();
                            if (payload === "[DONE]") {
                                stream.push({
                                    v: PROTOCOL_VERSION,
                                    type: MSG.DONE,
                                    id: genId,
                                    reason: finishReason ?? "stop",
                                    text: acc,
                                    finished_at: new Date().toISOString()
                                });
                                stream.end();
                                return;
                            }
                            let parsed;
                            try {
                                parsed = JSON.parse(payload);
                            } catch {
                                continue;
                            }

                            if (!metaSent) {
                                stream.push({
                                    v: PROTOCOL_VERSION,
                                    type: MSG.META,
                                    id: genId,
                                    model: parsed.model ?? resolvedModel,
                                    started_at: new Date().toISOString()
                                });
                                metaSent = true;
                            }

                            const choice = Array.isArray(parsed.choices) ? parsed.choices[0] : null;
                            const text = choice?.delta?.content ?? "";
                            if (text) {
                                acc += text;
                                stream.push({
                                    v: PROTOCOL_VERSION,
                                    type: MSG.TOKEN,
                                    id: genId,
                                    text
                                });
                            }
                            if (choice?.finish_reason) {
                                finishReason = choice.finish_reason;
                            }
                        }
                    }
                    // body ended without [DONE] — surface as stop with whatever we have.
                    stream.push({
                        v: PROTOCOL_VERSION,
                        type: MSG.DONE,
                        id: genId,
                        reason: finishReason ?? "stop",
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
            // The vLLM server is owned by the operator, not by us.
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
