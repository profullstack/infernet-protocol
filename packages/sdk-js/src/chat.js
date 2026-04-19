/**
 * Chat — SSE streaming helpers.
 *
 * The Infernet control plane answers chat jobs over Server-Sent Events.
 * Native `EventSource` doesn't support custom headers in browsers, so
 * we use `fetch` with a body reader and parse SSE frames manually. That
 * path works identically in Node 18+ and modern browsers.
 */

/**
 * @param {import("./index.js").InfernetClient} client
 * @param {{
 *   messages: Array<{ role: string, content: string }>,
 *   modelName?: string,
 *   maxTokens?: number,
 *   temperature?: number,
 *   signal?: AbortSignal
 * }} opts
 * @returns {AsyncIterableIterator<{ type: string, data: any, id?: number|string }>}
 */
export async function* streamChat(client, opts = {}) {
    const { messages, modelName, maxTokens, temperature, signal } = opts;
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error("chat: messages[] is required");
    }

    const initRes = await client.fetch(client._url("/api/chat"), {
        method: "POST",
        headers: client._headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ messages, modelName, maxTokens, temperature }),
        signal
    });
    const init = await client._json(initRes);
    if (!init?.streamUrl) throw new Error("chat: server did not return streamUrl");

    const streamRes = await client.fetch(client.baseUrl + init.streamUrl, {
        method: "GET",
        headers: client._headers({ Accept: "text/event-stream" }),
        signal
    });
    if (!streamRes.ok || !streamRes.body) {
        throw new Error(`chat: stream failed with HTTP ${streamRes.status}`);
    }

    // First event we yield contains the job metadata returned by POST /api/chat
    // so callers can show the assigned provider immediately, without waiting.
    yield { type: "job", data: { jobId: init.jobId, provider: init.provider, status: init.status } };

    for await (const frame of parseSseFrames(streamRes.body)) {
        yield frame;
        if (frame.type === "done" || frame.type === "error") return;
    }
}

/**
 * Non-streaming convenience: accumulate tokens and return the full text.
 *
 * @returns {Promise<{ text: string, jobId: string, provider: any, meta: any }>}
 */
export async function sendChat(client, opts) {
    let text = "";
    let jobId = null;
    let provider = null;
    let meta = null;

    for await (const ev of streamChat(client, opts)) {
        switch (ev.type) {
            case "job":
                jobId = ev.data.jobId;
                provider = ev.data.provider;
                break;
            case "meta":
                meta = ev.data;
                break;
            case "token":
                text += ev.data?.text ?? "";
                break;
            case "error": {
                const err = new Error(ev.data?.message ?? "chat error");
                err.event = ev;
                throw err;
            }
        }
    }

    return { text, jobId, provider, meta };
}

// ---------------------------------------------------------------------------
// SSE frame parser. Handles multi-line data fields and optional id/event.
// ---------------------------------------------------------------------------
async function* parseSseFrames(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buf = "";

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line.
        for (;;) {
            const splitAt = buf.indexOf("\n\n");
            if (splitAt < 0) break;
            const raw = buf.slice(0, splitAt);
            buf = buf.slice(splitAt + 2);
            const frame = parseFrame(raw);
            if (frame) yield frame;
        }
    }
    // Flush tail.
    const tail = parseFrame(buf);
    if (tail) yield tail;
}

function parseFrame(raw) {
    if (!raw || raw.startsWith(":")) return null; // comment / heartbeat
    let event = "message";
    let id;
    const dataLines = [];
    for (const line of raw.split("\n")) {
        if (!line) continue;
        const colon = line.indexOf(":");
        const field = colon < 0 ? line : line.slice(0, colon);
        let value = colon < 0 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        switch (field) {
            case "event": event = value; break;
            case "id":    id = value;    break;
            case "data":  dataLines.push(value); break;
            default: /* ignore retry / unknown */ break;
        }
    }
    if (dataLines.length === 0) return null;
    const text = dataLines.join("\n");
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { type: event, data, id };
}
