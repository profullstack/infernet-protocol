/**
 * Engine IPC protocol — v1.
 *
 * Source of truth for messages exchanged between the JS sidecar wrapper
 * (EngineProcess) and an engine binary on stdio. Format is NDJSON: one
 * JSON object per line, each terminated by `\n`.
 *
 * Every message carries `v` (protocol version) and `type`. Generation-scoped
 * messages also carry `id` so multiple in-flight generations can be
 * demultiplexed on a single stdio pair.
 *
 * Outbound (JS → engine):
 *   { v:1, type:"load",     model }
 *   { v:1, type:"generate", id, messages, model?, max_tokens?, temperature?, ... }
 *   { v:1, type:"cancel",   id }
 *   { v:1, type:"shutdown" }
 *
 * Inbound (engine → JS):
 *   { v:1, type:"ready",    model? }                              // engine-level
 *   { v:1, type:"meta",     id, model?, started_at }              // generation start
 *   { v:1, type:"token",    id, text }                            // streamed token
 *   { v:1, type:"done",     id, reason:"stop"|"length"|"cancel", text }
 *   { v:1, type:"error",    id?, message }                        // id absent → engine-level
 *   { v:1, type:"log",      level:"info"|"warn"|"error", message }
 *
 * Bumping PROTOCOL_VERSION is a breaking change. Mirror any change in
 * engine/mojo/src/main.mojo.
 */

export const PROTOCOL_VERSION = 1;

export const MSG = Object.freeze({
    // outbound
    LOAD: "load",
    GENERATE: "generate",
    CANCEL: "cancel",
    SHUTDOWN: "shutdown",
    // inbound
    READY: "ready",
    META: "meta",
    TOKEN: "token",
    DONE: "done",
    ERROR: "error",
    LOG: "log"
});

export function encode(msg) {
    return JSON.stringify({ v: PROTOCOL_VERSION, ...msg }) + "\n";
}

export function decode(line) {
    const trimmed = typeof line === "string" ? line.trim() : "";
    if (!trimmed) return null;
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    } catch (err) {
        return { type: MSG.ERROR, message: `bad ndjson: ${err.message}`, raw: trimmed };
    }
    if (parsed.v !== PROTOCOL_VERSION) {
        return {
            type: MSG.ERROR,
            message: `protocol version mismatch: expected ${PROTOCOL_VERSION}, got ${parsed.v}`
        };
    }
    return parsed;
}

/**
 * Buffered NDJSON splitter. Stdio chunks don't respect line boundaries, so
 * we accumulate and yield one message per `\n` boundary.
 */
export class NdjsonSplitter {
    constructor() {
        this.buf = "";
    }

    *push(chunk) {
        this.buf += chunk;
        let idx;
        while ((idx = this.buf.indexOf("\n")) !== -1) {
            const line = this.buf.slice(0, idx);
            this.buf = this.buf.slice(idx + 1);
            const msg = decode(line);
            if (msg) yield msg;
        }
    }
}
