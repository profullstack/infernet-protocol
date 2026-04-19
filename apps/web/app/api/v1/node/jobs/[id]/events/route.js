import { NextResponse } from "next/server";

import { handleRoute } from "@/lib/http";
import {
    verifySignedNextRequest,
    parseJsonBody
} from "@/lib/auth/verify-signed-request";
import { emitJobEvents } from "@/lib/data/node-api";

export async function POST(request, { params }) {
    return handleRoute(async () => {
        const { pubkey, body } = await verifySignedNextRequest(request);
        const json = parseJsonBody(body);
        const { id } = await params;
        const result = await emitJobEvents({
            pubkey,
            jobId: id,
            events: json.events
        });
        return NextResponse.json({ data: result });
    });
}
