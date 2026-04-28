import { describe, expect, it } from "vitest";

import {
    createVllmBackend,
    VLLM_DEFAULT_HOST,
    isVllmReachable
} from "../packages/engine/src/backends/vllm.js";
import { MSG } from "../packages/engine/src/protocol.js";

// Helper: build a fake fetchImpl that returns a streamed body of SSE
// lines. Each line is yielded as its own Uint8Array chunk so the
// backend's incremental line-buffer handling gets exercised.
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

describe("vLLM backend", () => {
    it("VLLM_DEFAULT_HOST is the canonical vllm port", () => {
        expect(VLLM_DEFAULT_HOST).toBe("http://localhost:8000");
    });

    it("isVllmReachable returns false when probe rejects", async () => {
        const ok = await isVllmReachable("http://127.0.0.1:1", 50);
        expect(ok).toBe(false);
    });

    it("createVllmBackend with skipProbe constructs without network", async () => {
        const engine = await createVllmBackend({ skipProbe: true, fetchImpl: async () => null });
        expect(engine.kind).toBe("vllm");
        expect(engine.host).toBe(VLLM_DEFAULT_HOST);
        expect(engine.hasApiKey).toBe(false);
    });

    it("VLLM_API_KEY env flips hasApiKey + sends Authorization header", async () => {
        const before = process.env.VLLM_API_KEY;
        process.env.VLLM_API_KEY = "test-key-abc";
        let captured = null;
        const fetchImpl = async (_url, init) => {
            captured = init;
            return fakeStreamingFetch(["data: [DONE]"])();
        };
        try {
            const engine = await createVllmBackend({ skipProbe: true, fetchImpl });
            expect(engine.hasApiKey).toBe(true);
            const gen = engine.generate({
                model: "Qwen/Qwen2.5-7B-Instruct",
                messages: [{ role: "user", content: "hi" }]
            });
            await drain(gen.stream);
            expect(captured?.headers?.authorization).toBe("Bearer test-key-abc");
        } finally {
            if (before === undefined) delete process.env.VLLM_API_KEY;
            else process.env.VLLM_API_KEY = before;
        }
    });

    it("emits ERROR when no model is configured and none passed in", async () => {
        const engine = await createVllmBackend({
            skipProbe: true,
            fetchImpl: fakeStreamingFetch([])
        });
        const gen = engine.generate({ messages: [{ role: "user", content: "hi" }] });
        const events = await drain(gen.stream);
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe(MSG.ERROR);
        expect(events[0].message).toMatch(/no model/);
    });

    it("translates vLLM SSE into meta + tokens + done", async () => {
        const fetchImpl = fakeStreamingFetch([
            'data: {"model":"Qwen/Qwen2.5-7B-Instruct","choices":[{"delta":{"content":"hi"}}]}',
            'data: {"model":"Qwen/Qwen2.5-7B-Instruct","choices":[{"delta":{"content":" there"}}]}',
            'data: {"model":"Qwen/Qwen2.5-7B-Instruct","choices":[{"delta":{},"finish_reason":"stop"}]}',
            'data: [DONE]'
        ]);
        const engine = await createVllmBackend({
            skipProbe: true,
            defaultModel: "Qwen/Qwen2.5-7B-Instruct",
            fetchImpl
        });
        const gen = engine.generate({ messages: [{ role: "user", content: "hi" }] });
        const events = await drain(gen.stream);

        const types = events.map((e) => e.type);
        expect(types[0]).toBe(MSG.META);
        expect(events[0].model).toBe("Qwen/Qwen2.5-7B-Instruct");

        const tokens = events.filter((e) => e.type === MSG.TOKEN).map((e) => e.text);
        expect(tokens.join("")).toBe("hi there");

        const last = events[events.length - 1];
        expect(last.type).toBe(MSG.DONE);
        expect(last.reason).toBe("stop");
        expect(last.text).toBe("hi there");
    });

    it("body uses OpenAI shape: model + messages + stream:true", async () => {
        let captured = null;
        const fetchImpl = async (_url, init) => {
            captured = JSON.parse(init.body);
            return fakeStreamingFetch(["data: [DONE]"])();
        };
        const engine = await createVllmBackend({
            skipProbe: true,
            defaultModel: "Qwen/Qwen2.5-7B-Instruct",
            fetchImpl
        });
        const gen = engine.generate({
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 64,
            temperature: 0.1
        });
        await drain(gen.stream);
        expect(captured).toMatchObject({
            model: "Qwen/Qwen2.5-7B-Instruct",
            messages: [{ role: "user", content: "hi" }],
            stream: true,
            max_tokens: 64,
            temperature: 0.1
        });
    });

    it("non-2xx response surfaces an ERROR event with the status", async () => {
        const fetchImpl = async () => ({
            ok: false,
            status: 503,
            async text() { return "service overloaded"; }
        });
        const engine = await createVllmBackend({
            skipProbe: true,
            defaultModel: "x",
            fetchImpl
        });
        const gen = engine.generate({ messages: [{ role: "user", content: "hi" }] });
        const events = await drain(gen.stream);
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe(MSG.ERROR);
        expect(events[0].message).toMatch(/HTTP 503/);
    });

    it("cancel() turns the in-flight generation into DONE reason='cancel'", async () => {
        // fetchImpl that hangs until aborted, then throws AbortError.
        const fetchImpl = (_url, init) =>
            new Promise((_resolve, reject) => {
                init.signal.addEventListener("abort", () => {
                    const err = new Error("aborted");
                    err.name = "AbortError";
                    reject(err);
                });
            });
        const engine = await createVllmBackend({
            skipProbe: true,
            defaultModel: "x",
            fetchImpl
        });
        const gen = engine.generate({ messages: [{ role: "user", content: "hi" }] });
        // Cancel on next tick.
        setImmediate(() => gen.cancel());
        const events = await drain(gen.stream);
        expect(events[events.length - 1]).toMatchObject({
            type: MSG.DONE,
            reason: "cancel"
        });
    });
});
