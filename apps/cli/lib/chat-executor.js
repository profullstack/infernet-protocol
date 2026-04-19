/**
 * Stub chat executor for the provider daemon.
 *
 * Reads `job.input_spec.messages` (OpenAI-shaped), emits tokens into the
 * control plane's `job_events` stream (via signed POSTs — nodes no longer
 * write to Supabase directly), and returns the full assistant text so the
 * caller can post it in the completion payload.
 *
 * Real llama.cpp / vLLM runtime can slot in later by replacing the token
 * loop with a streaming call.
 */

const STUB_RESPONSE_TEMPLATE = (input) => [
    `Running on the Infernet P2P network.`,
    `You said: "${String(input).slice(0, 200)}"`,
    `This is a stub response from the provider daemon — no real model is running yet.`,
    `When a real runtime (llama.cpp / vLLM) is wired into the job loop, tokens will stream from actual inference.`
].join(' ');

// Flush the event buffer when it hits this many tokens OR when we haven't
// flushed in this many ms. Batching amortizes the per-request signing cost
// without killing the streaming UX.
const EVENT_BATCH_MAX = 16;
const EVENT_BATCH_FLUSH_MS = 250;

function lastUserMessage(messages) {
    if (!Array.isArray(messages)) return '';
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const m = messages[i];
        if (m?.role === 'user' && typeof m.content === 'string') return m.content;
    }
    return '';
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

class EventBuffer {
    constructor(client, jobId) {
        this.client = client;
        this.jobId = jobId;
        this.events = [];
        this.lastFlush = Date.now();
    }
    async push(event_type, data) {
        this.events.push({ event_type, data });
        if (this.events.length >= EVENT_BATCH_MAX ||
            Date.now() - this.lastFlush >= EVENT_BATCH_FLUSH_MS) {
            await this.flush();
        }
    }
    async flush() {
        if (this.events.length === 0) return;
        const batch = this.events;
        this.events = [];
        this.lastFlush = Date.now();
        try {
            await this.client.postJobEvents(this.jobId, batch);
        } catch (err) {
            // Best-effort: put them back so the next flush retries once.
            // Still drop after a second failure to avoid unbounded growth.
            process.stderr.write(`postJobEvents failed: ${err?.message ?? err}\n`);
        }
    }
}

/**
 * Run the stub chat executor.
 *
 * @param {{ client: any, job: any, node: any }} ctx
 * @returns {Promise<string>} the full assistant response text.
 */
export async function executeChatJob({ client, job, node }) {
    const input = job?.input_spec ?? {};
    const messages = input.messages ?? [];
    const userText = lastUserMessage(messages);

    const buffer = new EventBuffer(client, job.id);

    await buffer.push('meta', {
        provider_node_id: node.nodeId,
        provider_name: node.name ?? null,
        model: job.model_name ?? null,
        started_at: new Date().toISOString()
    });

    const response = STUB_RESPONSE_TEMPLATE(userText);
    const tokens = response.split(/(\s+)/).filter(Boolean);

    let accumulated = '';
    for (const tok of tokens) {
        accumulated += tok;
        await buffer.push('token', { text: tok });
        await sleep(40 + Math.floor(Math.random() * 80));
    }

    await buffer.push('done', {
        text: accumulated,
        finished_at: new Date().toISOString()
    });
    await buffer.flush();

    return accumulated;
}

export async function failChatJob({ client, jobId, message }) {
    try {
        await client.postJobEvents(jobId, [{ event_type: 'error', data: { message } }]);
    } catch {
        // Non-fatal; the job row still gets marked 'failed' by the caller.
    }
}
