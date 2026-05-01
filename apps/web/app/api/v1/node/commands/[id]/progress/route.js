import { NextResponse } from "next/server";
import { handleRoute } from "@/lib/http";
import {
    verifySignedNextRequest,
    parseJsonBody
} from "@/lib/auth/verify-signed-request";
import { updateCommandProgressForNode } from "@/lib/data/node-commands";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/node/commands/<id>/progress
 *
 * Daemon reports streaming progress on a long-running command (e.g.
 * Ollama pull). Auth: Nostr signature. Server verifies the command's
 * pubkey matches the daemon's pubkey before storing.
 *
 * Body: { progress: { status, total?, completed?, pct? } }
 */
export async function POST(request, { params }) {
    return handleRoute(async () => {
        const { id } = await params;
        const { pubkey, body } = await verifySignedNextRequest(request);
        const json = parseJsonBody(body);
        const result = await updateCommandProgressForNode({
            pubkey,
            commandId: id,
            progress: json?.progress ?? null
        });
        return NextResponse.json({ data: result });
    });
}
