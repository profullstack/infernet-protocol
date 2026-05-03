import { NextResponse } from "next/server";

import { handleRoute } from "@/lib/http";
import {
    verifySignedNextRequest,
    parseJsonBody
} from "@/lib/auth/verify-signed-request";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/v1/search
 *
 * Centralized search proxy for `infernet train data`. Operators never see
 * the upstream provider key; the platform holds VALUESERP_API_KEY in env
 * and enforces a per-pubkey daily quota.
 *
 * Request (Nostr-signed via X-Infernet-Auth):
 *   { query: string, num?: 1..30, location?: string, domains?: string[] }
 *
 * Response 200:
 *   { data: SearchResult[], remaining: number, reset_at: string }
 *
 * Errors:
 *   401 missing/invalid signature
 *   400 invalid body
 *   429 rate-limited (burst or daily quota)
 *   502 upstream provider error
 */

const HARD_NUM_CAP = 30;
const QUERY_MAX_LEN = 200;
const LOCATION_MAX_LEN = 100;
const DOMAINS_MAX = 20;

const DAILY_LIMIT = Number.parseInt(process.env.SEARCH_DAILY_LIMIT ?? "50", 10);
const BURST_PER_MIN = Number.parseInt(process.env.SEARCH_BURST_PER_MIN ?? "10", 10);

// Per-process burst limiter — fine for single Next.js process. Daily quota
// uses the DB so it's correct across replicas.
const burst = rateLimit({ windowMs: 60_000, max: BURST_PER_MIN });

export async function POST(request) {
    return handleRoute(async () => {
        const { pubkey, body } = await verifySignedNextRequest(request);
        const json = parseJsonBody(body);

        // ── Validate body ─────────────────────────────────────────
        const query = typeof json.query === "string" ? json.query.trim() : "";
        if (!query) throwHttp(400, "query is required");
        if (query.length > QUERY_MAX_LEN) throwHttp(400, `query exceeds ${QUERY_MAX_LEN} chars`);

        let num = Number.parseInt(json.num ?? 20, 10);
        if (!Number.isFinite(num) || num < 1) num = 20;
        if (num > HARD_NUM_CAP) num = HARD_NUM_CAP;

        const location = typeof json.location === "string" ? json.location.trim() : null;
        if (location && location.length > LOCATION_MAX_LEN) throwHttp(400, "location too long");

        let domains = null;
        if (Array.isArray(json.domains)) {
            domains = json.domains
                .filter((d) => typeof d === "string" && d.trim())
                .map((d) => d.trim())
                .slice(0, DOMAINS_MAX);
            if (domains.length === 0) domains = null;
        }

        // ── Burst limit (per pubkey, in-memory) ───────────────────
        const burstRes = burst.check(pubkey);
        if (!burstRes.ok) {
            return NextResponse.json(
                {
                    error: "burst rate limit — slow down",
                    retry_after_ms: Math.max(0, burstRes.resetAt - Date.now())
                },
                { status: 429 }
            );
        }

        // ── Daily quota (per pubkey, DB-backed) ───────────────────
        const supabase = getSupabaseServerClient();
        const since = new Date(Date.now() - 24 * 3600_000).toISOString();
        const { count: usedToday, error: countErr } = await supabase
            .from("search_usage")
            .select("*", { count: "exact", head: true })
            .eq("pubkey", pubkey)
            .gte("created_at", since);
        if (countErr) {
            // Fail closed if we can't count — better to 503 than lose accounting.
            throwHttp(503, `quota lookup failed: ${countErr.message}`);
        }
        const used = usedToday ?? 0;
        if (used >= DAILY_LIMIT) {
            const oldestRecent = await supabase
                .from("search_usage")
                .select("created_at")
                .eq("pubkey", pubkey)
                .gte("created_at", since)
                .order("created_at", { ascending: true })
                .limit(1);
            const resetAt = oldestRecent.data?.[0]?.created_at
                ? new Date(new Date(oldestRecent.data[0].created_at).getTime() + 24 * 3600_000).toISOString()
                : new Date(Date.now() + 24 * 3600_000).toISOString();
            return NextResponse.json(
                {
                    error: `daily quota exceeded — ${used}/${DAILY_LIMIT}`,
                    used,
                    limit: DAILY_LIMIT,
                    reset_at: resetAt
                },
                { status: 429 }
            );
        }

        // ── Upstream call ─────────────────────────────────────────
        const apiKey = process.env.VALUESERP_API_KEY;
        if (!apiKey) throwHttp(503, "search provider not configured");

        const params = new URLSearchParams({
            api_key: apiKey,
            q: query,
            num: String(num),
            output: "json"
        });
        if (location) params.set("location", location);

        const upstream = await fetch(`https://api.valueserp.com/search?${params}`, {
            // ValueSerp is usually fast; 20s gives headroom without holding
            // the worker forever on a stuck upstream.
            signal: AbortSignal.timeout(20_000)
        }).catch((err) => {
            throwHttp(502, `upstream fetch failed: ${err?.message ?? err}`);
        });

        if (!upstream.ok) {
            const txt = await upstream.text().catch(() => upstream.statusText);
            throwHttp(502, `upstream ${upstream.status}: ${txt.slice(0, 200)}`);
        }

        const upstreamJson = await upstream.json();
        let results = (upstreamJson?.organic_results ?? []).map((r) => ({
            rank: r.position,
            title: r.title,
            url: r.link,
            snippet: r.snippet,
            domain: r.domain
        }));

        if (domains && results.length > 0) {
            results = results.filter((r) =>
                domains.some((d) => r.domain?.toLowerCase().includes(d.toLowerCase()))
            );
        }

        // ── Record usage (best-effort; don't fail the response) ──
        await supabase
            .from("search_usage")
            .insert({
                pubkey,
                query,
                num_requested: num,
                num_returned: results.length,
                domains
            })
            .then(({ error }) => {
                if (error) console.error("search_usage insert failed:", error.message);
            });

        return NextResponse.json({
            data: results,
            remaining: Math.max(0, DAILY_LIMIT - used - 1),
            limit: DAILY_LIMIT,
            reset_at: new Date(Date.now() + 24 * 3600_000).toISOString()
        });
    });
}

function throwHttp(status, message) {
    const err = new Error(message);
    err.status = status;
    throw err;
}
