/**
 * Chat executor for the provider daemon.
 *
 * Pulls tokens from `@infernetprotocol/engine` (Mojo+MAX binary or
 * in-process stub, depending on env) and forwards them to the control
 * plane's `job_events` stream via signed POSTs. The daemon doesn't know
 * which engine backend is loaded — that's `createEngine()`'s problem.
 *
 * Backend selection precedence (set by the operator at daemon start):
 *   1. INFERNET_ENGINE_BACKEND=mojo|stub
 *   2. INFERNET_ENGINE_BIN set → mojo
 *   3. otherwise → stub (canned tokens, daemon still works on a fresh box)
 */

import { createEngine, MSG } from "@infernetprotocol/engine";
import { loadConfig } from "./config.js";

// Flush the event buffer when it hits this many tokens OR when we haven't
// flushed in this many ms. Batching amortizes the per-request signing cost
// without killing the streaming UX.
const EVENT_BATCH_MAX = 16;
const EVENT_BATCH_FLUSH_MS = 250;

class EventBuffer {
    constructor(client, jobId) {
        this.client = client;
        this.jobId = jobId;
        this.events = [];
        this.lastFlush = Date.now();
    }
    async push(event_type, data) {
        this.events.push({ event_type, data });
        if (
            this.events.length >= EVENT_BATCH_MAX ||
            Date.now() - this.lastFlush >= EVENT_BATCH_FLUSH_MS
        ) {
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
            process.stderr.write(`postJobEvents failed: ${err?.message ?? err}\n`);
        }
    }
}

// One engine per daemon process — model load happens once. Lazy so the CLI
// doesn't pay the cost (or pull in the Mojo binary) until the first chat
// job actually arrives.
//
// We pull engine.{backend,model,ollamaHost} from the saved config so the
// daemon defaults to whatever `infernet setup` chose. The Ollama backend
// uses `defaultModel` when the job doesn't specify one (the playground
// /chat endpoint sometimes doesn't pass a model name). Without this
// fallback, every model-unspecified job died with
// "ollama backend: no model — set INFERNET_ENGINE_MODEL or pass model in the job"
let enginePromise = null;
function getEngine() {
    if (!enginePromise) {
        enginePromise = (async () => {
            const config = (await loadConfig()) ?? {};
            const eng = config.engine ?? {};
            const opts = {};
            if (eng.backend) opts.backend = eng.backend;
            if (eng.model) opts.defaultModel = eng.model;
            if (eng.ollamaHost) opts.host = eng.ollamaHost;
            return createEngine(opts);
        })().catch((err) => {
            // Reset so a transient failure doesn't permanently poison the
            // daemon — next job will retry initialization.
            enginePromise = null;
            throw err;
        });
    }
    return enginePromise;
}

export async function shutdownEngine() {
    if (!enginePromise) return;
    try {
        const engine = await enginePromise;
        await engine.shutdown();
    } catch {
        // best-effort
    } finally {
        enginePromise = null;
    }
}

/**
 * Run the chat executor for one job.
 *
 * @param {{ client: any, job: any, node: any }} ctx
 * @returns {Promise<string>} the full assistant response text.
 */
export async function executeChatJob({ client, job, node }) {
    const input = job?.input_spec ?? {};
    const messages = input.messages ?? [];

    const engine = await getEngine();
    const buffer = new EventBuffer(client, job.id);

    const generation = engine.generate({
        messages,
        model: job.model_name ?? null,
        max_tokens: input.max_tokens,
        temperature: input.temperature
    });

    let accumulated = "";

    for await (const ev of generation.stream) {
        switch (ev.type) {
            case MSG.META:
                await buffer.push("meta", {
                    provider_node_id: node.nodeId,
                    provider_name: node.name ?? null,
                    model: ev.model ?? job.model_name ?? null,
                    started_at: ev.started_at ?? new Date().toISOString(),
                    engine: engine.kind
                });
                break;
            case MSG.TOKEN:
                accumulated += ev.text ?? "";
                await buffer.push("token", { text: ev.text ?? "" });
                break;
            case MSG.DONE:
                if (typeof ev.text === "string" && ev.text.length > accumulated.length) {
                    accumulated = ev.text;
                }
                await buffer.push("done", {
                    text: accumulated,
                    reason: ev.reason ?? "stop",
                    finished_at: ev.finished_at ?? new Date().toISOString()
                });
                break;
            case MSG.ERROR:
                await buffer.push("error", { message: ev.message ?? "engine error" });
                await buffer.flush();
                throw new Error(ev.message ?? "engine error");
            default:
                // forward unknown event types verbatim — useful for backend
                // extensions (logits, tool_call, etc.) once the protocol grows.
                await buffer.push(ev.type, ev);
        }
    }

    await buffer.flush();
    return accumulated;
}

export async function failChatJob({ client, jobId, message }) {
    try {
        await client.postJobEvents(jobId, [{ event_type: "error", data: { message } }]);
    } catch {
        // Non-fatal; the job row still gets marked 'failed' by the caller.
    }
}
