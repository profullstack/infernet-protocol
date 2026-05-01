import { NextResponse } from "next/server";
import { handleRoute } from "@/lib/http";
import { verifySignedNextRequest, parseJsonBody } from "@/lib/auth/verify-signed-request";
import { listAvailableShards, TIER_TO_GB } from "@/lib/data/training-market";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/training/shards/available
 *
 * Daemon-only (Nostr signed). Returns up to N shards the operator can
 * pick up given their reported VRAM tier. The daemon's polling loop
 * calls this; matched shards then get claimed via /shards/<id>/claim.
 *
 * Body: { limit?: number }   default 5
 */
export async function POST(request) {
    return handleRoute(async () => {
        const { pubkey, body } = await verifySignedNextRequest(request);
        const json = parseJsonBody(body);
        const limit = Number.isFinite(json.limit) ? json.limit : 5;

        // Look up the operator's reported VRAM tier from providers row to
        // gate which jobs we surface.
        const supabase = getSupabaseServerClient();
        const { data: prov } = await supabase
            .from("providers")
            .select("specs")
            .eq("public_key", pubkey)
            .maybeSingle();
        const tier = (prov?.specs?.gpus ?? []).map((g) => g.vram_tier).find(Boolean) ?? "unknown";
        const vramGb = TIER_TO_GB[tier] ?? 0;

        const shards = await listAvailableShards({ pubkey, vramGb, limit });
        return NextResponse.json({ data: { shards, vram_gb: vramGb } });
    });
}
