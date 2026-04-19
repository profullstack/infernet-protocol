/**
 * Infernet Protocol JavaScript SDK.
 *
 * Thin wrapper around the public REST + SSE API exposed by an Infernet
 * control-plane deployment (self-hosted or hosted at infernet.tech).
 *
 * Works in Node.js 18+ and modern browsers — uses native `fetch` and
 * stream readers; no runtime dependencies.
 *
 *   import { InfernetClient } from "@infernetprotocol/sdk";
 *   const client = new InfernetClient({ baseUrl: "https://infernet.tech" });
 *
 *   const overview = await client.getOverview();
 *   const nodes    = await client.listNodes({ limit: 20 });
 *
 *   for await (const ev of client.chat({ messages: [{ role: "user", content: "hi" }] })) {
 *     if (ev.type === "token") process.stdout.write(ev.data.text);
 *     if (ev.type === "done")  console.log("\ndone");
 *   }
 */

import { streamChat, sendChat } from "./chat.js";
import { createInvoice } from "./payments.js";

export class InfernetClient {
    /**
     * @param {{ baseUrl: string, apiKey?: string, fetch?: typeof fetch }} opts
     */
    constructor(opts = {}) {
        if (!opts.baseUrl) throw new Error("InfernetClient: baseUrl is required");
        this.baseUrl = String(opts.baseUrl).replace(/\/+$/, "");
        this.apiKey = opts.apiKey ?? null;
        this.fetch = opts.fetch ?? globalThis.fetch;
        if (typeof this.fetch !== "function") {
            throw new Error("InfernetClient: no fetch implementation available");
        }
    }

    // -----------------------------------------------------------------------
    // Dashboard — GET endpoints
    // -----------------------------------------------------------------------
    getOverview(opts = {})      { return this._get("/api/overview",      opts); }
    listNodes(opts = {})        { return this._get("/api/nodes",         opts); }
    listProviders(opts = {})    { return this._get("/api/providers",     opts); }
    listAggregators(opts = {})  { return this._get("/api/aggregators",   opts); }
    listClients(opts = {})      { return this._get("/api/clients",       opts); }
    listModels(opts = {})       { return this._get("/api/models",        opts); }
    listJobs(opts = {})         { return this._get("/api/jobs",          opts); }

    // -----------------------------------------------------------------------
    // Chat
    // -----------------------------------------------------------------------
    /**
     * Submit a chat message and return an async iterator over SSE events.
     * Each yielded value is `{ type, data, id }`.
     *
     *   type: 'job' | 'meta' | 'token' | 'done' | 'error'
     *
     * @param {{
     *   messages: Array<{ role: string, content: string }>,
     *   modelName?: string,
     *   maxTokens?: number,
     *   temperature?: number,
     *   signal?: AbortSignal
     * }} opts
     */
    chat(opts) {
        return streamChat(this, opts);
    }

    /**
     * One-shot chat that accumulates the streamed response and resolves
     * with the full assistant text. Convenience for non-streaming callers.
     */
    async chatComplete(opts) {
        return sendChat(this, opts);
    }

    // -----------------------------------------------------------------------
    // Payments
    // -----------------------------------------------------------------------
    /**
     * @param {{ jobId: string, coin: string, network?: string }} opts
     */
    createInvoice(opts) {
        return createInvoice(this, opts);
    }

    // -----------------------------------------------------------------------
    // Internals
    // -----------------------------------------------------------------------
    _url(path, query) {
        const u = new URL(this.baseUrl + path);
        if (query) {
            for (const [k, v] of Object.entries(query)) {
                if (v === undefined || v === null) continue;
                u.searchParams.set(k, String(v));
            }
        }
        return u.toString();
    }

    _headers(extra) {
        const h = { Accept: "application/json", ...(extra ?? {}) };
        if (this.apiKey) h.Authorization = `Bearer ${this.apiKey}`;
        return h;
    }

    async _get(path, query) {
        const res = await this.fetch(this._url(path, query), {
            method: "GET",
            headers: this._headers()
        });
        return this._json(res);
    }

    async _post(path, body, { signal } = {}) {
        const res = await this.fetch(this._url(path), {
            method: "POST",
            headers: this._headers({ "Content-Type": "application/json" }),
            body: JSON.stringify(body ?? {}),
            signal
        });
        return this._json(res);
    }

    async _json(res) {
        const text = await res.text();
        let body = null;
        try { body = text ? JSON.parse(text) : null; } catch { /* non-json */ }
        if (!res.ok) {
            const message = body?.error ?? res.statusText ?? `HTTP ${res.status}`;
            const err = new Error(`Infernet API error ${res.status}: ${message}`);
            err.status = res.status;
            err.body = body ?? text;
            throw err;
        }
        return body;
    }
}

export default InfernetClient;
export { streamChat, sendChat } from "./chat.js";
export { createInvoice } from "./payments.js";
