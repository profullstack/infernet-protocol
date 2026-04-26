/**
 * Single-producer / single-consumer async queue used to surface engine
 * events as an async-iterable to backend callers.
 *
 * Shared by all backends (stub, ollama, mojo via EngineProcess) so the
 * iteration semantics are identical regardless of whether events arrive
 * from a child process, an HTTP stream, or in-process timers.
 *
 *   const q = new AsyncQueue();
 *   q.push(value); q.end(); q.fail(err);
 *   for await (const v of q) { ... }
 */

export class AsyncQueue {
    constructor() {
        this.values = [];
        this.waiters = [];
        this.closed = false;
        this.error = null;
    }

    push(v) {
        if (this.closed) return;
        const w = this.waiters.shift();
        if (w) w({ value: v, done: false });
        else this.values.push(v);
    }

    fail(err) {
        if (this.closed) return;
        this.error = err;
        this.closed = true;
        while (this.waiters.length) {
            const w = this.waiters.shift();
            w({ value: undefined, done: true, _err: err });
        }
    }

    end() {
        if (this.closed) return;
        this.closed = true;
        while (this.waiters.length) {
            const w = this.waiters.shift();
            w({ value: undefined, done: true });
        }
    }

    next() {
        if (this.values.length) {
            return Promise.resolve({ value: this.values.shift(), done: false });
        }
        if (this.closed) {
            if (this.error) return Promise.reject(this.error);
            return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise((resolve, reject) => {
            this.waiters.push((res) => {
                if (res._err) reject(res._err);
                else resolve(res);
            });
        });
    }

    [Symbol.asyncIterator]() {
        return this;
    }
}
