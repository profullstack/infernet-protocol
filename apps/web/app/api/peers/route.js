import { NextResponse } from "next/server";
import { listOnlinePeers } from "@/lib/data/peers";
import { handleRoute } from "@/lib/http";

/**
 * IPIP-0006 phase 1 — `/api/peers` bootstrap seed endpoint.
 *
 * Public, rate-limited (rate limit lives at infrastructure layer for
 * now; see IPIP-0001 launch criteria for read-route auth + per-IP
 * limits). Returns a snapshot of recently-heartbeat'd providers a
 * fresh node can dial to populate its DHT routing table.
 *
 * Query params:
 *   ?limit=N   1..100 (default 20)
 *
 * Response:
 *   { data: [{ pubkey, multiaddr, last_seen, served_models, gpu_model }, ...] }
 */
export async function GET(request) {
    return handleRoute(async () => {
        const { searchParams } = new URL(request.url);
        const limitRaw = searchParams.get("limit");
        const limit = limitRaw != null ? Number.parseInt(limitRaw, 10) : undefined;

        const peers = await listOnlinePeers({
            limit: Number.isFinite(limit) ? limit : undefined
        });

        return NextResponse.json({ data: peers });
    });
}
