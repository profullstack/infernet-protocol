/**
 * Spawn `llama-server` with an --rpc peer list (IPIP-0033 §4).
 *
 * Returns a handle the caller can:
 *   - `await ready` to wait until the HTTP server is listening
 *   - iterate `events()` for parsed stderr (layer assignments,
 *     peer-failed signals, etc.)
 *   - `kill()` to terminate the child cleanly
 *
 * The shape mirrors `nim-adapter` in spirit — a thin wrapper, no
 * hidden state, easy to mock by injecting `spawnFn` in tests.
 */
import { EventEmitter } from 'node:events';
import { parseLlamaStderrLine } from './stderr-parser.js';
import { MAX_RPC_PEERS } from './constants.js';

const READY_TIMEOUT_MS = 60_000;

/**
 * @param {Object} args
 * @param {string} args.modelPath          Absolute path to a GGUF.
 * @param {Array<{host:string, port:number}>} args.rpcPeers
 *     Up to MAX_RPC_PEERS slice servers to connect to. Capped silently
 *     when over the limit — caller should check length beforehand.
 * @param {string} [args.host='127.0.0.1'] Bind interface for the HTTP
 *     server. Daemons typically use 127.0.0.1 and proxy through the
 *     existing daemon HTTP listener.
 * @param {number} [args.port=0]           0 = let the OS choose.
 * @param {number} [args.gpuLayers]        --gpu-layers value. When
 *     omitted, llama-server picks; when set, the primary keeps that
 *     many on local GPU and farms the rest to RPC peers.
 * @param {string} [args.binary='llama-server']
 * @param {string[]} [args.extraArgs]      Pass-through CLI args.
 * @param {(cmd:string,args:string[],opts?:object)=>any} [args.spawnFn]
 *     Test seam — defaults to node:child_process.spawn.
 * @returns {Promise<RpcServerHandle>}
 */
export async function spawnLlamaServer(args) {
    const {
        modelPath,
        rpcPeers,
        host = '127.0.0.1',
        port = 0,
        gpuLayers,
        binary = 'llama-server',
        extraArgs = [],
        spawnFn
    } = args ?? {};

    if (typeof modelPath !== 'string' || !modelPath) {
        throw new Error('spawnLlamaServer: modelPath is required');
    }
    if (!Array.isArray(rpcPeers)) {
        throw new Error('spawnLlamaServer: rpcPeers must be an array');
    }

    const cappedPeers = rpcPeers.slice(0, MAX_RPC_PEERS);
    const rpcArg = cappedPeers
        .filter((p) => p && typeof p.host === 'string' && Number.isFinite(p.port))
        .map((p) => `${p.host}:${p.port}`)
        .join(',');

    const childArgs = [
        '--model', modelPath,
        '--host', host,
        '--port', String(port)
    ];
    if (rpcArg) childArgs.push('--rpc', rpcArg);
    if (Number.isFinite(gpuLayers)) childArgs.push('--gpu-layers', String(gpuLayers));
    childArgs.push(...extraArgs);

    const spawn = spawnFn ?? (await import('node:child_process')).spawn;
    const child = spawn(binary, childArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

    return new RpcServerHandle({ child, requestedPort: port });
}

class RpcServerHandle extends EventEmitter {
    constructor({ child, requestedPort }) {
        super();
        this._child = child;
        this._buffered = '';
        this._eventsQueue = [];
        this._waiters = [];
        this._closed = false;
        this._serverReady = false;
        this._serverInfo = null;
        this._exited = null;

        this._readyResolve = null;
        this._readyReject = null;
        this.ready = new Promise((resolve, reject) => {
            this._readyResolve = resolve;
            this._readyReject = reject;
        });
        // Attach a no-op catch so a caller that never awaits `ready`
        // (e.g. tests that just want to inspect spawn args) doesn't
        // leak an unhandled rejection when the child exits or kills.
        // Real callers that DO await ready still see the rejection.
        this.ready.catch(() => { /* swallow */ });

        const readyTimeout = setTimeout(() => {
            if (!this._serverReady) {
                this._readyReject?.(new Error(`llama-server did not become ready within ${READY_TIMEOUT_MS}ms`));
            }
        }, READY_TIMEOUT_MS);
        if (typeof readyTimeout.unref === 'function') readyTimeout.unref();

        const onStderr = (chunk) => {
            this._buffered += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
            let nl;
            while ((nl = this._buffered.indexOf('\n')) >= 0) {
                const line = this._buffered.slice(0, nl);
                this._buffered = this._buffered.slice(nl + 1);
                this._handleLine(line);
            }
        };
        child.stderr?.on?.('data', onStderr);
        child.stdout?.on?.('data', onStderr); // some llama.cpp builds log to stdout

        child.on?.('exit', (code, signal) => {
            this._exited = { code, signal };
            this._closed = true;
            clearTimeout(readyTimeout);
            if (!this._serverReady) {
                this._readyReject?.(new Error(`llama-server exited before ready (code=${code} signal=${signal})`));
            }
            this._drainQueue();
            this._waiters.forEach((w) => w({ done: true, value: undefined }));
            this._waiters.length = 0;
            this.emit('exit', this._exited);
        });
    }

    /**
     * Async iterable of parsed stderr events — { type, ... } objects
     * matching parseLlamaStderrLine's shape, plus a synthetic
     * 'log' event with `text` for unparseable lines so the daemon can
     * relay them as IPIP-0033 §UX log frames.
     */
    events() {
        const self = this;
        return {
            [Symbol.asyncIterator]() {
                return {
                    next() {
                        if (self._eventsQueue.length > 0) {
                            return Promise.resolve({ value: self._eventsQueue.shift(), done: false });
                        }
                        if (self._closed) {
                            return Promise.resolve({ value: undefined, done: true });
                        }
                        return new Promise((resolve) => self._waiters.push(resolve));
                    }
                };
            }
        };
    }

    get serverInfo() { return this._serverInfo; }
    get exited() { return this._exited; }

    kill(signal = 'SIGTERM') {
        if (this._closed || !this._child) return;
        try { this._child.kill(signal); } catch { /* ignore */ }
    }

    _handleLine(rawLine) {
        const text = rawLine.replace(/\r$/, '');
        const parsed = parseLlamaStderrLine(text);
        const ev = parsed ?? { type: 'log', text };

        if (ev.type === 'server_ready' && !this._serverReady) {
            this._serverReady = true;
            this._serverInfo = { host: ev.host, port: ev.port };
            this._readyResolve?.({ host: ev.host, port: ev.port });
        }

        this._enqueue(ev);
    }

    _enqueue(ev) {
        const waiter = this._waiters.shift();
        if (waiter) {
            waiter({ value: ev, done: false });
        } else {
            this._eventsQueue.push(ev);
        }
        this.emit(ev.type, ev);
    }

    _drainQueue() {
        // After the child exits, any remaining queued events are still
        // delivered before the iterator reports done.
    }
}
