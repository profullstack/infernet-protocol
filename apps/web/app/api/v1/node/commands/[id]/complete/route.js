import { NextResponse } from "next/server";
import { handleRoute } from "@/lib/http";
import {
    verifySignedNextRequest,
    parseJsonBody
} from "@/lib/auth/verify-signed-request";
import { completeCommandForNode } from "@/lib/data/node-commands";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/node/commands/<id>/complete
 *
 * Daemon reports a command finished. Auth: Nostr signature. Server
 * verifies the row's pubkey matches the daemon's pubkey before
 * updating.
 *
 * Body: { status: 'completed' | 'failed', result?: object, error?: string }
 */
export async function POST(request, { params }) {
    return handleRoute(async () => {
        const { id } = await params;
        const { pubkey, body } = await verifySignedNextRequest(request);
        const json = parseJsonBody(body);
        const status = String(json.status ?? "").trim();
        const result = await completeCommandForNode({
            pubkey,
            commandId: id,
            status,
            result: json.result,
            errorMessage: typeof json.error === "string" ? json.error : null
        });
        return NextResponse.json({ data: result });
    });
}
