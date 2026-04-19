/**
 * Stub chat executor for the provider daemon.
 *
 * Reads `job.input_spec.messages` (OpenAI-shaped), emits tokens into
 * `job_events` so the SSE stream can relay them to the web UI, and
 * finally writes the full text into `jobs.result` + marks the job
 * 'completed'. Real llama.cpp / vLLM runtime can slot in later by
 * replacing `generateStub()` with a streaming call.
 */

const STUB_RESPONSE_TEMPLATE = (input) => [
    `Running on the Infernet P2P network.`,
    `You said: "${String(input).slice(0, 200)}"`,
    `This is a stub response from the provider daemon — no real model is running yet.`,
    `When a real runtime (llama.cpp / vLLM) is wired into the job loop, tokens will stream from actual inference.`
].join(' ');

function lastUserMessage(messages) {
    if (!Array.isArray(messages)) return '';
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const m = messages[i];
        if (m?.role === 'user' && typeof m.content === 'string') return m.content;
    }
    return '';
}

async function emitEvent(supabase, jobId, eventType, data) {
    const { error } = await supabase.from('job_events').insert({
        job_id: jobId,
        event_type: eventType,
        data
    });
    if (error) throw error;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * Run the stub chat executor. Yields a token every ~40-120ms so the UI
 * gets a responsive typing effect.
 *
 * @param {{ supabase: any, job: any, node: any }} ctx
 * @returns {Promise<string>} the full assistant response text.
 */
export async function executeChatJob({ supabase, job, node }) {
    const input = job?.input_spec ?? {};
    const messages = input.messages ?? [];
    const userText = lastUserMessage(messages);

    await emitEvent(supabase, job.id, 'meta', {
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
        await emitEvent(supabase, job.id, 'token', { text: tok });
        await sleep(40 + Math.floor(Math.random() * 80));
    }

    await emitEvent(supabase, job.id, 'done', {
        text: accumulated,
        finished_at: new Date().toISOString()
    });

    return accumulated;
}

export async function failChatJob({ supabase, jobId, message }) {
    try {
        await emitEvent(supabase, jobId, 'error', { message });
    } catch {
        // best-effort; the job row still gets marked 'failed' by the caller
    }
}
