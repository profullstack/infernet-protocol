/**
 * Client-side helpers for talking to the control plane's /api/chat
 * endpoint. The control plane creates a job, assigns it to an online
 * provider (or falls back to NIM if none are online), and exposes an
 * SSE stream the client tails for tokens.
 *
 * This is the wire that makes `infernet chat` actually use the P2P
 * network — not just local Ollama.
 *
 * Flow:
 *   POST   /api/chat                         → { jobId, streamUrl, source, provider }
 *   GET    /api/chat/stream/<jobId>  (SSE)   → events: job | meta | token | done | error
 */

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Submit a chat job to the control plane. Returns the job descriptor
 * including the SSE stream URL.
 */
export async function submitChatJob(baseUrl, { messages, model, maxTokens, temperature, signal } = {}) {
    if (!baseUrl) throw new Error("submitChatJob: baseUrl is required");
    const url = new URL("/api/chat", baseUrl);
    const body = { messages };
    if (model) body.modelName = model;
    if (typeof maxTokens === "number") body.maxTokens = maxTokens;
    if (typeof temperature === "number") body.temperature = temperature;

    const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
        signal
    });
    if (!res.ok) {
        let detail = "";
        try { detail = await res.text(); } catch { /* ignore */ }
        const err = new Error(`POST /api/chat → HTTP ${res.status}: ${detail.slice(0, 200)}`);
        err.status = res.status;
        throw err;
    }
    return await res.json();
}

/**
 * Tail an SSE stream from the control plane and yield parsed events.
 *
 * Yields `{ event, data }` objects where `event` is one of
 * "job" | "meta" | "token" | "done" | "error" (and possibly more) and
 * `data` is the parsed JSON payload.
 */
export async function* streamChatEvents(baseUrl, streamPath, { signal } = {}) {
    if (!baseUrl) throw new Error("streamChatEvents: baseUrl is required");
    if (!streamPath) throw new Error("streamChatEvents: streamPath is required");

    const url = new URL(streamPath, baseUrl);
    const res = await fetch(url, {
        method: "GET",
        headers: { accept: "text/event-stream" },
        signal
    });
    if (!res.ok) {
        throw new Error(`SSE ${url} → HTTP ${res.status}`);
    }
    if (!res.body) {
        throw new Error("SSE response had no body");
    }

    const decoder = new TextDecoder();
    let buf = "";
    let currentEvent = null;
    let dataLines = [];

    const flush = () => {
        if (!dataLines.length && !currentEvent) return null;
        const raw = dataLines.join("\n");
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch {
            parsed = raw;
        }
        const ev = { event: currentEvent ?? "message", data: parsed };
        currentEvent = null;
        dataLines = [];
        return ev;
    };

    for await (const chunk of res.body) {
        buf += decoder.decode(chunk, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, nl).replace(/\r$/, "");
            buf = buf.slice(nl + 1);

            if (line === "") {
                const ev = flush();
                if (ev) yield ev;
                continue;
            }
            if (line.startsWith(":")) continue; // SSE comment

            const colon = line.indexOf(":");
            const field = colon === -1 ? line : line.slice(0, colon);
            const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");

            if (field === "event") currentEvent = value;
            else if (field === "data") dataLines.push(value);
            // id / retry: ignored for now
        }
    }
    // Flush trailing event if the stream didn't end with a blank line.
    const tail = flush();
    if (tail) yield tail;
}
