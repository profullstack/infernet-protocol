import { NextResponse } from "next/server";
import { getBootstrapPeers } from "@/lib/data/infernet";
import { handleRoute } from "@/lib/http";

/**
 * GET /api/peers?limit=N — IPIP-0006 bootstrap seed peers.
 *
 * Public, unsigned read: the infernet daemon fetches this on startup
 * (apps/cli/lib/peers.js → bootstrapPeers()) to find recently-heartbeat'd
 * providers to dial into the p2p mesh. Without it every node comes up with
 * zero peers. Shape: { data: [{ pubkey, multiaddr, last_seen, served_models,
 * gpu_model }] }.
 */
export async function GET(request) {
  return handleRoute(async () => {
    const { searchParams } = new URL(request.url);
    const raw = Number(searchParams.get("limit"));
    const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 100) : 20;
    const data = await getBootstrapPeers({ limit });
    return NextResponse.json(
      { data },
      { headers: { "cache-control": "public, max-age=30, s-maxage=30" } }
    );
  });
}
