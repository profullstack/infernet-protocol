/**
 * Streaming chat helper for llama-server's HTTP API. Mirrors the
 * `streamChatCompletion` shape from `@infernetprotocol/nim-adapter` so
 * the chat-stream proxy can swap one for the other without reshaping
 * events.
 *
 * llama-server speaks two relevant endpoints:
 *   - POST /completion          (its native streaming format)
 *   - POST /v1/chat/completions (OpenAI-compatible)
 *
 * We use the OpenAI-compatible one because it's stable across
 * versions and the rest of Infernet already speaks that shape.
 */

/**
 * Yields events:
 *   { type: 'meta',  data: { engine: 'llama.cpp', model, started_at } }
 *   { type: 'token', data: { text } }
 *   { type: 'done',  data: { text, finished_at } }
 *   { type: 'error', data: { message } }
 *
 * @param {{
 *   baseUrl: string,                       // e.g. http://127.0.0.1:8080
 *   model: string,
 *   messages: Array<{role:string, content:string}>,
 *   maxTokens?: number,
 *   temperature?: number,
 *   signal?: AbortSignal
 * }} opts
 */
export async function* streamChatCompletion(opts = {}) {
    const { baseUrl, model, messages, maxTokens = 512, temperature = 0.7, signal } = opts;
    if (!baseUrl) throw new Error('rpc-adapter: baseUrl is required');
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error('rpc-adapter: messages[] is required');
    }

    const url = `${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;
    const startedAt = new Date().toISOString();
    yield { type: 'meta', data: { engine: 'llama.cpp', model, started_at: startedAt } };

    let res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                model,
                messages,
                stream: true,
                max_tokens: maxTokens,
                temperature
            }),
            signal
        });
    } catch (err) {
        yield { type: 'error', data: { message: `llama-server fetch failed: ${err?.message ?? err}` } };
        return;
    }

    if (!res.ok || !res.body) {
        yield { type: 'error', data: { message: `llama-server HTTP ${res.status}` } };
        return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let nl;
            while ((nl = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, nl).trim();
                buffer = buffer.slice(nl + 1);
                if (!line.startsWith('data:')) continue;
                const payload = line.slice(5).trim();
                if (payload === '[DONE]') {
                    yield {
                        type: 'done',
                        data: { text: fullText, finished_at: new Date().toISOString() }
                    };
                    return;
                }
                let chunk;
                try { chunk = JSON.parse(payload); } catch { continue; }
                const delta = chunk?.choices?.[0]?.delta?.content;
                if (typeof delta === 'string' && delta.length > 0) {
                    fullText += delta;
                    yield { type: 'token', data: { text: delta } };
                }
                const finish = chunk?.choices?.[0]?.finish_reason;
                if (finish && finish !== null) {
                    yield {
                        type: 'done',
                        data: { text: fullText, finished_at: new Date().toISOString(), finish_reason: finish }
                    };
                    return;
                }
            }
        }
        // Stream ended without [DONE] — emit done so callers don't hang.
        yield { type: 'done', data: { text: fullText, finished_at: new Date().toISOString(), incomplete: true } };
    } catch (err) {
        yield { type: 'error', data: { message: err?.message ?? String(err) } };
    }
}
