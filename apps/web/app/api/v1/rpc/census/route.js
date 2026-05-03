import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { handleRoute } from "@/lib/http";
import { MIN_RPC_PEERS } from "@infernetprotocol/rpc-adapter/constants";
import { summarizeRpcCensus } from "@/lib/data/rpc-routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * IPIP-0033 Phase 4 — public census endpoint. Reports the number of
 * live RPC primaries and eligible RPC slices for a given model, plus
 * a `ready` boolean the chat playground uses to decide whether to
 * enable the "Distribute across all nodes" checkbox.
 *
 *   GET /api/v1/rpc/census?model=qwen2.5:72b[&min_trust_tier=verified]
 *
 * Response:
 *   {
 *     "model": "qwen2.5:72b",
 *     "primaries": 1,
 *     "slices": 3,
 *     "min_slices": 2,
 *     "ready": true
 *   }
 *
 * Public + cacheable for a few seconds. The 2-minute liveness window
 * matches what runRpcProxy uses, so a `ready: true` here is a
 * reliable promise that submitting a distributed-mode chat won't
 * fail-closed on shortfall.
 */
export async function GET(request) {
    return handleRoute(async () => {
        const url = new URL(request.url);
        const model = url.searchParams.get("model");
        if (!model) {
            return NextResponse.json(
                { error: "model query param is required" },
                { status: 400 }
            );
        }
        const minTrustTier = url.searchParams.get("min_trust_tier") ?? undefined;
        const supabase = getSupabaseServerClient();
        const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

        const [primariesRes, slicesRes] = await Promise.all([
            supabase
                .from("providers")
                .select("id, name, public_key, trust_tier")
                .eq("status", "available")
                .gte("last_seen", twoMinAgo)
                .contains("specs", { rpc_primary: { models: [model] } })
                .limit(64),
            supabase
                .from("providers")
                .select("id, name, public_key, trust_tier, address, specs")
                .eq("status", "available")
                .gte("last_seen", twoMinAgo)
                .contains("specs", { rpc: { models: [model] } })
                .limit(64)
        ]);
        if (primariesRes.error) throw primariesRes.error;
        if (slicesRes.error) throw slicesRes.error;

        const census = summarizeRpcCensus({
            model,
            primaries: primariesRes.data ?? [],
            slices: slicesRes.data ?? [],
            minSlices: MIN_RPC_PEERS,
            minTrustTier
        });

        return NextResponse.json(census, {
            headers: { "Cache-Control": "public, max-age=10, s-maxage=10" }
        });
    });
}
