import { NextResponse } from "next/server";
import { handleRoute } from "@/lib/http";
import {
    verifySignedNextRequest,
    parseJsonBody
} from "@/lib/auth/verify-signed-request";
import { pollCommandsForNode } from "@/lib/data/node-commands";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/node/commands/poll
 *
 * Daemon-side: claim pending commands for this node. Authenticated
 * by Nostr signature (same mechanism as job poll). Server flips
 * status pending → running atomically, daemon executes, then calls
 * /api/v1/node/commands/<id>/complete.
 *
 * Body: { limit?: number }   default 5, max 10
 * Response: { data: { commands: [{ id, command, args }, ...] } }
 */
export async function POST(request) {
    return handleRoute(async () => {
        const { pubkey, body } = await verifySignedNextRequest(request);
        const json = parseJsonBody(body);
        const limit = Number.isFinite(json.limit) ? json.limit : 5;
        const result = await pollCommandsForNode({ pubkey, limit });
        return NextResponse.json({ data: result });
    });
}
