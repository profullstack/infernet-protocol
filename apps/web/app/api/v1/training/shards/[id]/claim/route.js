import { NextResponse } from "next/server";
import { handleRoute } from "@/lib/http";
import { verifySignedNextRequest } from "@/lib/auth/verify-signed-request";
import { claimShard } from "@/lib/data/training-market";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/training/shards/<id>/claim
 *
 * Daemon-only (Nostr signed). Atomically flips a pending shard →
 * claimed by this pubkey. Returns full shard payload (config, dataset,
 * upload URL) so the daemon can start training.
 */
export async function POST(request, { params }) {
    return handleRoute(async () => {
        const { id } = await params;
        const { pubkey } = await verifySignedNextRequest(request);
        const result = await claimShard({ pubkey, shardId: id });
        return NextResponse.json({ data: result });
    });
}
