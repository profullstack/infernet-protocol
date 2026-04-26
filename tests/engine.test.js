import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createServer } from "node:http";
import {
    EngineProcess,
    createEngine,
    decode,
    encode,
    isOllamaReachable,
    NdjsonSplitter,
    PROTOCOL_VERSION,
    MSG
} from "@infernetprotocol/engine";

const here = dirname(fileURLToPath(import.meta.url));
const fakeBin = join(here, "..", "packages", "engine", "test", "fake-engine.js");

/**
 * Spin up an in-process HTTP server that mimics the bits of Ollama's API
 * we use. Returns `{ url, close, setChatHandler }` — tests can register a
 * chat handler that writes raw NDJSON chunks to the response stream.
 */
function startFakeOllama({ tagsOk = true } = {}) {
    let chatHandler = null;
    const server = createServer((req, res) => {
        if (req.url === "/api/tags" && req.method === "GET") {
            if (tagsOk) {
                res.writeHead(200, { "content-type": "application/json" });
                res.end(JSON.stringify({ models: [] }));
            } else {
                res.writeHead(500);
                res.end();
            }
            return;
        }
        if (req.url === "/api/chat" && req.method === "POST") {
            const chunks = [];
            req.on("data", (c) => chunks.push(c));
            req.on("end", async () => {
                const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                if (chatHandler) await chatHandler(body, res);
                else {
                    res.writeHead(500);
                    res.end("no handler");
                }
            });
            return;
        }
        res.writeHead(404);
        res.end();
    });
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address();
            resolve({
                url: `http://127.0.0.1:${port}`,
                close: () => new Promise((r) => server.close(r)),
                setChatHandler: (fn) => {
                    chatHandler = fn;
                }
            });
        });
    });
}

describe("protocol codec", () => {
    it("round-trips a message through encode/decode", () => {
        const wire = encode({ type: MSG.TOKEN, id: "abc", text: "hi" });
        expect(wire.endsWith("\n")).toBe(true);
        const back = decode(wire);
        expect(back).toEqual({ v: PROTOCOL_VERSION, type: MSG.TOKEN, id: "abc", text: "hi" });
    });

    it("returns null on empty input", () => {
        expect(decode("")).toBeNull();
        expect(decode("   ")).toBeNull();
    });

    it("flags a version mismatch as a protocol error", () => {
        const out = decode(JSON.stringify({ v: 999, type: "token" }));
        expect(out.type).toBe(MSG.ERROR);
        expect(out.message).toMatch(/protocol version mismatch/);
    });

    it("flags malformed JSON without throwing", () => {
        const out = decode("{not json");
        expect(out.type).toBe(MSG.ERROR);
        expect(out.message).toMatch(/bad ndjson/);
    });
});

describe("NdjsonSplitter", () => {
    it("yields one message per newline regardless of chunk boundaries", () => {
        const s = new NdjsonSplitter();
        const m1 = encode({ type: MSG.TOKEN, id: "a", text: "x" });
        const m2 = encode({ type: MSG.TOKEN, id: "a", text: "y" });

        // Split mid-message: head + middle + tail.
        const all = m1 + m2;
        const head = all.slice(0, 12);
        const mid = all.slice(12, 30);
        const tail = all.slice(30);

        const out = [];
        for (const msg of s.push(head)) out.push(msg);
        for (const msg of s.push(mid)) out.push(msg);
        for (const msg of s.push(tail)) out.push(msg);

        expect(out).toHaveLength(2);
        expect(out[0]).toMatchObject({ type: MSG.TOKEN, text: "x" });
        expect(out[1]).toMatchObject({ type: MSG.TOKEN, text: "y" });
    });
});

describe("EngineProcess against fake engine", () => {
    it("waits for ready, then streams meta → tokens → done for one generation", async () => {
        const proc = new EngineProcess({
            binary: process.execPath,
            args: [fakeBin],
            env: { FAKE_RESPONSE: "alpha beta gamma" }
        });
        const ready = await proc.start();
        expect(ready.type).toBe(MSG.READY);

        const { stream } = proc.generate({
            messages: [{ role: "user", content: "hi" }],
            model: "fake-model"
        });
        const events = [];
        for await (const ev of stream) events.push(ev);

        expect(events[0].type).toBe(MSG.META);
        expect(events.at(-1).type).toBe(MSG.DONE);
        const text = events.filter((e) => e.type === MSG.TOKEN).map((e) => e.text).join("");
        expect(text).toBe("alpha beta gamma");
        expect(events.at(-1).text).toBe("alpha beta gamma");

        await proc.shutdown();
    });

    it("interleaves two concurrent generations on the same process", async () => {
        const proc = new EngineProcess({
            binary: process.execPath,
            args: [fakeBin],
            env: { FAKE_RESPONSE: "a b c d" }
        });
        await proc.start();

        const g1 = proc.generate({ messages: [{ role: "user", content: "1" }] });
        const g2 = proc.generate({ messages: [{ role: "user", content: "2" }] });

        async function collect(stream) {
            const out = [];
            for await (const ev of stream) out.push(ev);
            return out;
        }

        const [e1, e2] = await Promise.all([collect(g1.stream), collect(g2.stream)]);
        for (const events of [e1, e2]) {
            expect(events[0].type).toBe(MSG.META);
            expect(events.at(-1).type).toBe(MSG.DONE);
            expect(events.at(-1).text).toBe("a b c d");
        }
        expect(g1.id).not.toBe(g2.id);

        await proc.shutdown();
    });

    it("cancellation terminates the stream with reason=cancel", async () => {
        const proc = new EngineProcess({
            binary: process.execPath,
            args: [fakeBin],
            env: { FAKE_RESPONSE: "x x x x x x x x x x x x", FAKE_TOKEN_MS: "20" }
        });
        await proc.start();

        const { stream, cancel } = proc.generate({
            messages: [{ role: "user", content: "hi" }]
        });
        // Cancel after seeing the first token so we know generation started.
        let cancelled = false;
        const events = [];
        for await (const ev of stream) {
            events.push(ev);
            if (!cancelled && ev.type === MSG.TOKEN) {
                cancel();
                cancelled = true;
            }
        }
        expect(events.at(-1).type).toBe(MSG.DONE);
        expect(events.at(-1).reason).toBe("cancel");

        await proc.shutdown();
    });
});

describe("createEngine factory", () => {
    it("returns the stub backend by default", async () => {
        const engine = await createEngine({ backend: "stub", tokenDelayMs: 0 });
        expect(engine.kind).toBe("stub");

        const { stream } = engine.generate({
            messages: [{ role: "user", content: "ping" }]
        });
        const events = [];
        for await (const ev of stream) events.push(ev);
        expect(events[0].type).toBe(MSG.META);
        expect(events.at(-1).type).toBe(MSG.DONE);
        expect(events.at(-1).text).toContain("Running on the Infernet P2P network");
        await engine.shutdown();
    });
});

describe("Ollama backend", () => {
    let fake;

    afterEach(async () => {
        if (fake) {
            await fake.close();
            fake = null;
        }
    });

    it("isOllamaReachable returns true when /api/tags responds 200", async () => {
        fake = await startFakeOllama({ tagsOk: true });
        expect(await isOllamaReachable(fake.url)).toBe(true);
    });

    it("isOllamaReachable returns false on connection error", async () => {
        // Pick an almost-certainly-closed port.
        expect(await isOllamaReachable("http://127.0.0.1:1", 100)).toBe(false);
    });

    it("streams meta → tokens → done from a chat response", async () => {
        fake = await startFakeOllama();
        fake.setChatHandler(async (body, res) => {
            expect(body.model).toBe("qwen2.5:0.5b");
            expect(body.messages[0].content).toBe("hi");
            res.writeHead(200, { "content-type": "application/x-ndjson" });
            const chunks = ["hello", " ", "world"];
            for (const c of chunks) {
                res.write(
                    JSON.stringify({
                        model: "qwen2.5:0.5b",
                        created_at: new Date().toISOString(),
                        message: { role: "assistant", content: c },
                        done: false
                    }) + "\n"
                );
            }
            res.write(
                JSON.stringify({
                    model: "qwen2.5:0.5b",
                    created_at: new Date().toISOString(),
                    message: { role: "assistant", content: "" },
                    done: true,
                    done_reason: "stop"
                }) + "\n"
            );
            res.end();
        });

        const engine = await createEngine({
            backend: "ollama",
            host: fake.url,
            skipProbe: true
        });
        const { stream } = engine.generate({
            messages: [{ role: "user", content: "hi" }],
            model: "qwen2.5:0.5b"
        });
        const events = [];
        for await (const ev of stream) events.push(ev);

        expect(events[0].type).toBe(MSG.META);
        expect(events[0].model).toBe("qwen2.5:0.5b");
        expect(events.filter((e) => e.type === MSG.TOKEN).map((e) => e.text).join("")).toBe(
            "hello world"
        );
        expect(events.at(-1).type).toBe(MSG.DONE);
        expect(events.at(-1).reason).toBe("stop");
        expect(events.at(-1).text).toBe("hello world");
        await engine.shutdown();
    });

    it("surfaces an error on non-2xx response", async () => {
        fake = await startFakeOllama();
        fake.setChatHandler(async (_body, res) => {
            res.writeHead(404, { "content-type": "text/plain" });
            res.end('model "ghost:7b" not found');
        });

        const engine = await createEngine({
            backend: "ollama",
            host: fake.url,
            skipProbe: true
        });
        const { stream } = engine.generate({
            messages: [{ role: "user", content: "hi" }],
            model: "ghost:7b"
        });
        const events = [];
        for await (const ev of stream) events.push(ev);

        expect(events.at(-1).type).toBe(MSG.ERROR);
        expect(events.at(-1).message).toMatch(/HTTP 404/);
    });

    it("emits an error when no model is provided", async () => {
        fake = await startFakeOllama();
        const engine = await createEngine({
            backend: "ollama",
            host: fake.url,
            skipProbe: true
        });
        const { stream } = engine.generate({
            messages: [{ role: "user", content: "hi" }]
        });
        const events = [];
        for await (const ev of stream) events.push(ev);

        expect(events.at(-1).type).toBe(MSG.ERROR);
        expect(events.at(-1).message).toMatch(/no model/);
    });

    it("cancel() ends the stream with reason=cancel", async () => {
        fake = await startFakeOllama();
        fake.setChatHandler(async (_body, res) => {
            res.writeHead(200, { "content-type": "application/x-ndjson" });
            // Slow-drip tokens so cancel() lands mid-stream.
            let i = 0;
            const timer = setInterval(() => {
                if (res.writableEnded || res.destroyed) {
                    clearInterval(timer);
                    return;
                }
                res.write(
                    JSON.stringify({
                        model: "qwen2.5:0.5b",
                        created_at: new Date().toISOString(),
                        message: { role: "assistant", content: `t${i} ` },
                        done: false
                    }) + "\n"
                );
                i += 1;
                if (i > 50) clearInterval(timer);
            }, 20);
        });

        const engine = await createEngine({
            backend: "ollama",
            host: fake.url,
            skipProbe: true
        });
        const { stream, cancel } = engine.generate({
            messages: [{ role: "user", content: "hi" }],
            model: "qwen2.5:0.5b"
        });

        const events = [];
        for await (const ev of stream) {
            events.push(ev);
            if (ev.type === MSG.TOKEN && events.filter((e) => e.type === MSG.TOKEN).length >= 2) {
                cancel();
            }
        }
        expect(events.at(-1).type).toBe(MSG.DONE);
        expect(events.at(-1).reason).toBe("cancel");
    });

    it("auto-selects ollama backend when reachable and INFERNET_ENGINE_BIN unset", async () => {
        fake = await startFakeOllama({ tagsOk: true });
        const prev = {
            backend: process.env.INFERNET_ENGINE_BACKEND,
            bin: process.env.INFERNET_ENGINE_BIN,
            host: process.env.OLLAMA_HOST
        };
        delete process.env.INFERNET_ENGINE_BACKEND;
        delete process.env.INFERNET_ENGINE_BIN;
        process.env.OLLAMA_HOST = fake.url;

        try {
            const engine = await createEngine({ skipProbe: true, host: fake.url });
            // skipProbe avoids a second probe inside createOllamaBackend; the
            // factory's autoSelectBackend already probed and picked "ollama".
            expect(engine.kind).toBe("ollama");
            await engine.shutdown();
        } finally {
            if (prev.backend !== undefined) process.env.INFERNET_ENGINE_BACKEND = prev.backend;
            if (prev.bin !== undefined) process.env.INFERNET_ENGINE_BIN = prev.bin;
            if (prev.host !== undefined) process.env.OLLAMA_HOST = prev.host;
            else delete process.env.OLLAMA_HOST;
        }
    });
});
