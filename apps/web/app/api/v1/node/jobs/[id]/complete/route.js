import { NextResponse } from "next/server";

import { handleRoute } from "@/lib/http";
import {
    verifySignedNextRequest,
    parseJsonBody
} from "@/lib/auth/verify-signed-request";
import { completeJobForNode } from "@/lib/data/node-api";

export async function POST(request, { params }) {
    return handleRoute(async () => {
        const { pubkey, body } = await verifySignedNextRequest(request);
        const json = parseJsonBody(body);
        const { id } = await params;
        const row = await completeJobForNode({ pubkey, jobId: id, body: json });
        return NextResponse.json({ data: row });
    });
}
