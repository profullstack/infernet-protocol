import { describe, expect, it } from "vitest";

import {
    createLlamacppBackend,
    LLAMACPP_DEFAULT_HOST,
    isLlamacppReachable
} from "../packages/engine/src/backends/llamacpp.js";
import { MSG } from "../packages/engine/src/protocol.js";

function fakeStreamingFetch(sseLines, { ok = true, status = 200 } = {}) {
    const enc = new TextEncoder();
    return async () => ({
        ok,
        status,
        async text() { return ""; },
        body: (async function* () {
            for (const line of sseLines) {
                yield enc.encode(line + "\n");
            }
        })()
    });
}

async function drain(stream) {
    const out = [];
    for await (const ev of stream) out.push(ev);
    return out;
}

describe("llama.cpp / llama-swap backend", () => {
    it("LLAMACPP_DEFAULT_HOST is the canonical llama-server port", () => {
        expect(LLAMACPP_DEFAULT_HOST).toBe("http://localhost:8080");
    });

    it("isLlamacppReachable returns false when probe rejects", async () => {
        const ok = await isLlamacppReachable("http://127.0.0.1:1", 50);
        expect(ok).toBe(false);
    });

    it("createLlamacppBackend with skipProbe constructs without network", async () => {
        const engine = await createLlamacppBackend({ skipProbe: true, fetchImpl: async () => null });
        expect(engine.kind).toBe("llamacpp");
        expect(engine.host).toBe(LLAMACPP_DEFAULT_HOST);
        expect(engine.hasApiKey).toBe(false);
    });

    it("emits ERROR when no model configured and none passed", async () => {
        const engine = await createLlamacppBackend({
            skipProbe: true,
            fetchImpl: fakeStreamingFetch([])
        });
        const gen = engine.generate({ messages: [{ role: "user", content: "hi" }] });
        const events = await drain(gen.stream);
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe(MSG.ERROR);
        expect(events[0].message).toMatch(/no model/);
    });

    it("translates llama.cpp SSE into meta + tokens + done", async () => {
        const fetchImpl = fakeStreamingFetch([
            'data: {"model":"qwen2.5-7b","choices":[{"delta":{"content":"hello"}}]}',
            'data: {"model":"qwen2.5-7b","choices":[{"delta":{"content":" world"}}]}',
            'data: {"model":"qwen2.5-7b","choices":[{"delta":{},"finish_reason":"stop"}]}',
            'data: [DONE]'
        ]);
        const engine = await createLlamacppBackend({
            skipProbe: true,
            defaultModel: "qwen2.5-7b",
            fetchImpl
        });
        const gen = engine.generate({ messages: [{ role: "user", content: "hi" }] });
        const events = await drain(gen.stream);

        expect(events[0].type).toBe(MSG.META);
        const tokens = events.filter((e) => e.type === MSG.TOKEN).map((e) => e.text);
        expect(tokens.join("")).toBe("hello world");
        const last = events[events.length - 1];
        expect(last.type).toBe(MSG.DONE);
        expect(last.reason).toBe("stop");
        expect(last.text).toBe("hello world");
    });

    it("LLAMACPP_API_KEY env adds Authorization header", async () => {
        const before = process.env.LLAMACPP_API_KEY;
        process.env.LLAMACPP_API_KEY = "secret-key";
        let captured = null;
        const fetchImpl = async (_url, init) => {
            captured = init;
            return fakeStreamingFetch(["data: [DONE]"])();
        };
        try {
            const engine = await createLlamacppBackend({ skipProbe: true, fetchImpl });
            const gen = engine.generate({
                model: "qwen2.5-7b",
                messages: [{ role: "user", content: "hi" }]
            });
            await drain(gen.stream);
            expect(captured?.headers?.authorization).toBe("Bearer secret-key");
        } finally {
            if (before === undefined) delete process.env.LLAMACPP_API_KEY;
            else process.env.LLAMACPP_API_KEY = before;
        }
    });

    it("non-2xx surfaces ERROR with the status", async () => {
        const fetchImpl = async () => ({
            ok: false,
            status: 500,
            async text() { return "model not loaded"; }
        });
        const engine = await createLlamacppBackend({
            skipProbe: true,
            defaultModel: "qwen2.5-7b",
            fetchImpl
        });
        const gen = engine.generate({ messages: [{ role: "user", content: "hi" }] });
        const events = await drain(gen.stream);
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe(MSG.ERROR);
        expect(events[0].message).toMatch(/HTTP 500/);
    });
});
