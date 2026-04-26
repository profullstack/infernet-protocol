/**
 * Long-lived child-process wrapper around an engine binary.
 *
 * Spawns the binary once, keeps it warm so model load cost isn't paid per
 * request, and demultiplexes streamed responses by generation id. Each call
 * to `generate()` returns an async-iterable stream of protocol events that
 * terminates on the first `done` or `error` for that id.
 *
 * The wrapper is binary-agnostic — it talks to anything that speaks the
 * NDJSON protocol in `./protocol.js`. The Mojo backend uses it; tests use
 * it with a fake Node-based engine.
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { AsyncQueue } from "./async-queue.js";
import { encode, MSG, NdjsonSplitter } from "./protocol.js";

export class EngineProcess {
    /**
     * @param {{ binary: string, args?: string[], env?: Record<string,string>, model?: string|null, cwd?: string }} opts
     */
    constructor({ binary, args = [], env = {}, model = null, cwd } = {}) {
        if (!binary) throw new Error("EngineProcess: binary is required");
        this.binary = binary;
        this.args = args;
        this.env = env;
        this.model = model;
        this.cwd = cwd;
        this.child = null;
        this.streams = new Map();
        this.splitter = new NdjsonSplitter();
        this.closed = false;
        this._readyResolve = null;
        this._readyReject = null;
    }

    async start() {
        this.child = spawn(this.binary, this.args, {
            stdio: ["pipe", "pipe", "inherit"],
            env: { ...process.env, ...this.env },
            cwd: this.cwd
        });
        this.child.stdout.setEncoding("utf8");
        this.child.stdout.on("data", (chunk) => this._onStdout(chunk));
        this.child.on("exit", (code, signal) => this._onExit(code, signal));
        this.child.on("error", (err) => this._onChildError(err));

        const ready = new Promise((resolve, reject) => {
            this._readyResolve = resolve;
            this._readyReject = reject;
        });

        if (this.model) {
            this._send({ type: MSG.LOAD, model: this.model });
        }

        return ready;
    }

    _send(msg) {
        if (!this.child || this.closed) throw new Error("engine not running");
        this.child.stdin.write(encode(msg));
    }

    _onStdout(chunk) {
        for (const msg of this.splitter.push(chunk)) {
            if (msg.type === MSG.READY) {
                if (this._readyResolve) {
                    this._readyResolve(msg);
                    this._readyResolve = null;
                    this._readyReject = null;
                }
                continue;
            }
            if (msg.type === MSG.LOG) {
                const level = msg.level ?? "info";
                process.stderr.write(`[engine ${level}] ${msg.message ?? ""}\n`);
                continue;
            }
            const id = msg.id;
            if (id && this.streams.has(id)) {
                const q = this.streams.get(id);
                q.push(msg);
                if (msg.type === MSG.DONE || msg.type === MSG.ERROR) {
                    q.end();
                    this.streams.delete(id);
                }
                continue;
            }
            // Engine-level error before ready.
            if (msg.type === MSG.ERROR && this._readyReject) {
                this._readyReject(new Error(msg.message ?? "engine error during start"));
                this._readyResolve = null;
                this._readyReject = null;
            }
        }
    }

    _onExit(code, signal) {
        if (this.closed) return;
        this.closed = true;
        const err = new Error(`engine exited (code=${code ?? "null"}, signal=${signal ?? "null"})`);
        for (const q of this.streams.values()) q.fail(err);
        this.streams.clear();
        if (this._readyReject) {
            this._readyReject(err);
            this._readyResolve = null;
            this._readyReject = null;
        }
    }

    _onChildError(err) {
        if (this._readyReject) {
            this._readyReject(err);
            this._readyResolve = null;
            this._readyReject = null;
        }
    }

    /**
     * Start a generation. Returns `{ id, stream, cancel }` where `stream`
     * is an async-iterable yielding protocol events (`meta`, `token`,
     * `done`, `error`) until the generation terminates.
     */
    generate(req = {}) {
        if (this.closed) throw new Error("engine closed");
        const id = req.id ?? randomUUID();
        const q = new AsyncQueue();
        this.streams.set(id, q);
        this._send({ type: MSG.GENERATE, ...req, id });
        return {
            id,
            stream: q,
            cancel: () => {
                try {
                    this._send({ type: MSG.CANCEL, id });
                } catch {
                    // engine already gone — caller will see done/error via stream
                }
            }
        };
    }

    async shutdown({ timeoutMs = 5000 } = {}) {
        if (this.closed || !this.child) return;
        try {
            this._send({ type: MSG.SHUTDOWN });
        } catch {
            // best-effort
        }
        await new Promise((resolve) => {
            const t = setTimeout(() => {
                try {
                    this.child.kill("SIGTERM");
                } catch {
                    // already dead
                }
                resolve();
            }, timeoutMs);
            this.child.once("exit", () => {
                clearTimeout(t);
                resolve();
            });
        });
    }
}
