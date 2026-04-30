/**
 * SGLang backend — talks to a local SGLang server over the OpenAI-compatible
 * chat completions endpoint.
 *
 * SGLang (Structured Generation Language) offers competitive throughput with
 * vLLM (RadixAttention for KV-cache reuse, speculative decoding, jump-forward
 * constrained decoding). Default port is 30000.
 *
 * Start: python -m sglang.launch_server --model-path <model> --port 30000
 *
 * Wire protocol is identical to vLLM (OpenAI SSE), so the streaming logic
 * mirrors vllm.js exactly — only defaults differ.
 */

import { randomUUID } from "node:crypto";
import { AsyncQueue } from "../async-queue.js";
import { MSG, PROTOCOL_VERSION } from "../protocol.js";

const DEFAULT_HOST = "http://localhost:30000";
const PROBE_TIMEOUT_MS = 500;

export const SGLANG_DEFAULT_HOST = DEFAULT_HOST;

export async function isSglangReachable(host = DEFAULT_HOST, timeoutMs = PROBE_TIMEOUT_MS) {
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

export async function createSglangBackend({
    host = process.env.SGLANG_HOST ?? DEFAULT_HOST,
    apiKey = process.env.SGLANG_API_KEY ?? null,
    defaultModel = process.env.SGLANG_MODEL ?? process.env.INFERNET_ENGINE_MODEL ?? null,
    skipProbe = false,
    fetchImpl = globalThis.fetch
} = {}) {
    if (!skipProbe) {
        const ok = await isSglangReachable(host);
        if (!ok) {
            throw new Error(
                `SGLang not reachable at ${host} — start with 'python -m sglang.launch_server --model-path <model>' or set SGLANG_HOST`
            );
        }
    }

    return {
        kind: "sglang",
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
                        message: "sglang backend: no model — set SGLANG_MODEL or pass model in the job"
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
                    try { detail = await res.text(); } catch { /* best-effort */ }
                    stream.push({
                        v: PROTOCOL_VERSION,
                        type: MSG.ERROR,
                        id: genId,
                        message: `sglang HTTP ${res.status}: ${detail.slice(0, 200)}`
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
                            try { parsed = JSON.parse(payload); } catch { continue; }

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
                                stream.push({ v: PROTOCOL_VERSION, type: MSG.TOKEN, id: genId, text });
                            }
                            if (choice?.finish_reason) finishReason = choice.finish_reason;
                        }
                    }
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
                stream.push({ v: PROTOCOL_VERSION, type: MSG.ERROR, id: genId, message: err?.message ?? String(err) });
                stream.end();
            });

            return { id: genId, stream, cancel: () => ctrl.abort() };
        },
        async shutdown() {}
    };
}

function pushTerminal(stream, genId, ctrl, err, accSoFar) {
    if (ctrl.signal.aborted) {
        stream.push({ v: PROTOCOL_VERSION, type: MSG.DONE, id: genId, reason: "cancel", text: accSoFar, finished_at: new Date().toISOString() });
    } else {
        stream.push({ v: PROTOCOL_VERSION, type: MSG.ERROR, id: genId, message: err?.message ?? String(err) });
    }
    stream.end();
}
