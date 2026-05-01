import { NextResponse } from "next/server";
import { handleRoute } from "@/lib/http";
import { verifySignedNextRequest, parseJsonBody } from "@/lib/auth/verify-signed-request";
import { reportShard } from "@/lib/data/training-market";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/training/shards/<id>/report
 *
 * Daemon-only (Nostr signed). Operator reports completed | failed.
 * On completed: triggers payout (TODO: wire CPR receipt — IPIP-0007).
 *
 * Body: { status: 'completed' | 'failed', adapter_url?, metrics?, error? }
 */
export async function POST(request, { params }) {
    return handleRoute(async () => {
        const { id } = await params;
        const { pubkey, body } = await verifySignedNextRequest(request);
        const json = parseJsonBody(body);
        const result = await reportShard({
            pubkey,
            shardId: id,
            status: String(json.status ?? ""),
            adapterUrl: json.adapter_url ?? null,
            metrics: json.metrics ?? null,
            errorMessage: json.error ?? null
        });
        return NextResponse.json({ data: result });
    });
}
