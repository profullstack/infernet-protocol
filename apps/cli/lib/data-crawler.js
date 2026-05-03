/**
 * Search-driven training-data collector.
 *
 * Pipeline:
 *   1. Hit infernetprotocol.com/api/v1/search with a query (Nostr-signed).
 *      The control plane proxies to the real provider, holds the upstream
 *      key, and enforces a per-pubkey daily quota.
 *   2. For each URL: fetch HTML, strip nav/script/style, extract main text.
 *   3. For each page: chunk into Q/A pairs (heading-based) and emit JSONL.
 *
 * The output JSONL uses the chatml `messages` shape, ready to feed into
 * `infernet train run` or any HF/Unsloth/Axolotl pipeline.
 *
 * Self-host escape hatch: set INFERNET_DIRECT_VALUESERP=1 with a
 * VALUESERP_API_KEY in env (or `integrations.valueserp.api_key` in config)
 * to bypass the control plane and call valueserp directly.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { signRequest, AUTH_HEADER } from "@infernetprotocol/auth";
import { loadConfig } from "./config.js";

const SEARCH_PATH = "/api/v1/search";

/** Resolve a direct VALUESERP_API_KEY for the escape hatch. */
export async function resolveValueSerpKey() {
    if (process.env.VALUESERP_API_KEY) return process.env.VALUESERP_API_KEY;
    const cfg = await loadConfig().catch(() => null);
    return cfg?.integrations?.valueserp?.api_key
        ?? cfg?.valueserp?.api_key
        ?? null;
}

/**
 * Search via the control plane (default path). Auth is the node's existing
 * Nostr keypair — operators don't need a separate API key.
 *
 * @param {object} opts
 * @param {string} opts.query
 * @param {string} opts.controlPlaneUrl
 * @param {string} opts.publicKey   - 64-hex Nostr pubkey
 * @param {string} opts.privateKey  - 64-hex Nostr privkey
 * @param {number} [opts.num=20]
 * @param {string} [opts.location]
 * @param {string[]} [opts.domains]
 * @param {number} [opts.timeoutMs=25000]
 */
export async function infernetSearch({
    query,
    controlPlaneUrl,
    publicKey,
    privateKey,
    num = 20,
    location,
    domains,
    timeoutMs = 25_000
} = {}) {
    if (!query) throw new Error("search: query required");
    if (!controlPlaneUrl) throw new Error("search: controlPlaneUrl required");
    if (!publicKey || !privateKey) throw new Error("search: Nostr keypair required (run `infernet init`)");

    const base = controlPlaneUrl.replace(/\/+$/, "");
    const bodyObj = { query, num };
    if (location) bodyObj.location = location;
    if (domains?.length) bodyObj.domains = domains;
    const bodyText = JSON.stringify(bodyObj);

    const { header } = signRequest({
        method: "POST",
        path: SEARCH_PATH,
        body: bodyText,
        publicKey,
        privateKey
    });

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
        res = await fetch(base + SEARCH_PATH, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                [AUTH_HEADER]: header
            },
            body: bodyText,
            signal: ctrl.signal
        });
    } finally {
        clearTimeout(t);
    }

    const text = await res.text();
    let payload = null;
    if (text) {
        try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
    }

    if (!res.ok) {
        const msg = payload?.error ?? `HTTP ${res.status}`;
        const err = new Error(`search failed: ${msg}`);
        err.status = res.status;
        err.body = payload;
        throw err;
    }
    return {
        results: payload?.data ?? [],
        remaining: payload?.remaining,
        limit: payload?.limit,
        resetAt: payload?.reset_at
    };
}

/**
 * Direct ValueSerp call — only used when INFERNET_DIRECT_VALUESERP=1.
 * Kept for self-hosters who don't want to depend on the control plane.
 */
export async function valueSerpSearch({ query, apiKey, num = 20, location } = {}) {
    if (!query) throw new Error("valueserp: query required");
    if (!apiKey) throw new Error("valueserp: apiKey required (set VALUESERP_API_KEY)");

    const params = new URLSearchParams({
        api_key: apiKey,
        q: query,
        num: String(num),
        output: "json"
    });
    if (location) params.set("location", location);

    const res = await fetch(`https://api.valueserp.com/search?${params}`);
    if (!res.ok) {
        const txt = await res.text().catch(() => res.statusText);
        throw new Error(`ValueSerp ${res.status}: ${txt.slice(0, 200)}`);
    }
    const json = await res.json();
    return (json?.organic_results ?? []).map((r) => ({
        rank: r.position,
        title: r.title,
        url: r.link,
        snippet: r.snippet,
        domain: r.domain
    }));
}

/** Cheap HTML → readable text. Strips scripts/styles/nav, collapses whitespace. */
export function extractTextFromHtml(html) {
    if (!html) return "";
    // Drop script + style content entirely.
    let s = html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "")
        .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "");
    // Drop common non-content elements.
    s = s.replace(/<(nav|footer|aside|header|form|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
    // Convert headings/paragraphs/list items to text with line breaks.
    s = s.replace(/<\/?(h[1-6]|p|li|br|div|tr)[^>]*>/gi, "\n");
    // Strip remaining tags.
    s = s.replace(/<[^>]+>/g, " ");
    // Decode common entities.
    s = s
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'");
    // Collapse whitespace.
    s = s.replace(/[ \t]+/g, " ").replace(/\n[ \t]*/g, "\n").replace(/\n{3,}/g, "\n\n");
    return s.trim();
}

/** Fetch a URL and extract its main text content. Returns "" on failure. */
export async function fetchAndExtract(url, { timeoutMs = 15_000 } = {}) {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        const res = await fetch(url, {
            signal: ctrl.signal,
            redirect: "follow",
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; InfernetTrainCrawler/0.1; +https://infernetprotocol.com)"
            }
        });
        clearTimeout(t);
        if (!res.ok) return "";
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("text/html") && !ct.includes("text/plain")) return "";
        const html = await res.text();
        return extractTextFromHtml(html);
    } catch {
        return "";
    }
}

/**
 * Convert a long body of text into chatml-style JSONL training examples.
 * Heuristic: split on blank lines into paragraphs; treat the first
 * paragraph as a "question" prompt and following paragraphs as the
 * model's answer. Skips paragraphs shorter than minChars or longer than
 * maxChars (caps very long pages).
 */
export function paragraphsToChatml({ url, title, text, query, minChars = 200, maxChars = 4000 }) {
    const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    const examples = [];
    for (let i = 0; i < paras.length; i += 1) {
        const para = paras[i];
        if (para.length < minChars) continue;
        const truncated = para.length > maxChars ? para.slice(0, maxChars) + "…" : para;
        examples.push({
            messages: [
                { role: "system", content: `You are an expert assistant trained on ${title ?? url}.` },
                { role: "user",   content: `${query} — section ${i + 1}` },
                { role: "assistant", content: truncated }
            ],
            meta: { source_url: url, source_title: title, query, paragraph_index: i }
        });
    }
    return examples;
}

/**
 * Top-level helper: search + crawl + chunk → write training JSONL.
 * Used by the `infernet train data` CLI surface.
 *
 * Pass `search: { mode: "control-plane", controlPlaneUrl, publicKey, privateKey }`
 * to route through the platform proxy (default), or
 * `search: { mode: "direct", apiKey }` to call the upstream provider yourself.
 *
 * @returns {{ urls: number, examples: number, outPath: string, quota?: object }}
 */
export async function buildTrainingDataset({
    query,
    search,
    outPath,
    num = 20,
    minChars = 200,
    maxChars = 4000,
    domains = null,        // optional whitelist (e.g. ["svelte.dev", "github.com"])
    onProgress = () => {}
}) {
    if (!search?.mode) throw new Error("buildTrainingDataset: search.mode is required");

    let results;
    let quota = null;
    if (search.mode === "direct") {
        results = await valueSerpSearch({ query, apiKey: search.apiKey, num });
    } else if (search.mode === "control-plane") {
        // Server applies the domain filter, but we still pass it so the
        // server can short-circuit irrelevant results before billing them.
        const out = await infernetSearch({
            query,
            num,
            domains,
            controlPlaneUrl: search.controlPlaneUrl,
            publicKey: search.publicKey,
            privateKey: search.privateKey
        });
        results = out.results;
        quota = { remaining: out.remaining, limit: out.limit, resetAt: out.resetAt };
    } else {
        throw new Error(`buildTrainingDataset: unknown search.mode "${search.mode}"`);
    }

    const filtered = domains
        ? results.filter((r) => domains.some((d) => r.domain?.includes(d)))
        : results;

    await fs.mkdir(path.dirname(outPath), { recursive: true });
    const out = await fs.open(outPath, "w");

    let totalExamples = 0;
    let urlsUsed = 0;
    for (let i = 0; i < filtered.length; i += 1) {
        const r = filtered[i];
        onProgress({ stage: "fetch", index: i + 1, total: filtered.length, url: r.url });
        const text = await fetchAndExtract(r.url);
        if (!text || text.length < minChars) continue;
        urlsUsed += 1;
        const examples = paragraphsToChatml({
            url: r.url, title: r.title, text, query, minChars, maxChars
        });
        for (const ex of examples) {
            await out.write(JSON.stringify(ex) + "\n");
            totalExamples += 1;
        }
    }
    await out.close();
    return { urls: urlsUsed, examples: totalExamples, outPath, quota };
}
