/**
 * Streaming sanitizer — strips known training-data-leak tag pairs
 * (e.g. `<ip_reminder>...</ip_reminder>`, `<system-reminder>...`,
 * `<foo>...</foo>`) from token streams without
 * breaking legitimate content.
 *
 * Why this exists: community fine-tunes (especially "uncensored"
 * variants) are often trained on data scraped from Claude
 * conversations that contained these tags as part of Anthropic's
 * internal prompt scaffolding. The model memorized them and
 * occasionally regurgitates them at inference time. We strip them
 * defense-in-depth regardless of which engine ran the inference.
 *
 * State-machine pattern: tokens accumulate in a small buffer until
 * we know they don't open a leak-tag; if they do, we suppress
 * everything up to the matching closing tag, then resume emitting.
 */

const LEAK_TAGS = ["ip_reminder", "system-reminder"];
const NAMESPACED_PREFIX = "antml:"; // e.g. <foo>

// Single regex: matches any opening leak tag.
const OPEN_PATTERN = new RegExp(
    `<(${LEAK_TAGS.join("|")}|${NAMESPACED_PREFIX}[\\w-]+)>`
);

/**
 * Create a per-stream sanitizer. Call .process(chunk) for each token
 * batch as it arrives; call .flush() at end-of-stream to drain the
 * tail buffer (any in-progress suppression is dropped — we never saw
 * the close tag, so we treat the trailing data as still-suspect).
 *
 * Returns the sanitized text to forward downstream.
 */
export function makeStreamSanitizer() {
    let buffer = "";
    let suppressing = null; // closing tag string we're waiting for, or null

    return {
        process(chunk) {
            if (chunk == null) return "";
            buffer += String(chunk);
            let out = "";

            while (buffer.length > 0) {
                if (suppressing) {
                    const idx = buffer.indexOf(suppressing);
                    if (idx === -1) {
                        // Close tag not yet seen — keep buffering, emit nothing.
                        return out;
                    }
                    // Drop the suppressed block + close tag.
                    buffer = buffer.slice(idx + suppressing.length);
                    suppressing = null;
                    continue;
                }

                const m = buffer.match(OPEN_PATTERN);
                if (m) {
                    // Emit everything before the open tag, then start suppressing.
                    out += buffer.slice(0, m.index);
                    buffer = buffer.slice(m.index + m[0].length);
                    suppressing = `</${m[1]}>`;
                    continue;
                }

                // No leak tag in current buffer. If a `<` shows up in the
                // last 32 chars, it could be the start of a partial leak
                // tag we haven't fully received yet — hold back.
                const lastLt = buffer.lastIndexOf("<");
                if (lastLt !== -1 && buffer.length - lastLt < 32) {
                    out += buffer.slice(0, lastLt);
                    buffer = buffer.slice(lastLt);
                    return out;
                }

                out += buffer;
                buffer = "";
            }
            return out;
        },
        flush() {
            // End-of-stream: emit residual buffer unless we're still
            // mid-suppression (no close tag ever arrived → drop, since
            // the leak block is still suspect).
            const out = suppressing ? "" : buffer;
            buffer = "";
            suppressing = null;
            return out;
        }
    };
}

/**
 * One-shot version for non-streamed text (e.g. final result body).
 */
export function sanitizeText(text) {
    const s = makeStreamSanitizer();
    return s.process(text) + s.flush();
}
