import { NextResponse } from "next/server";

import { handleRoute } from "@/lib/http";
import {
    verifySignedNextRequest,
    parseJsonBody
} from "@/lib/auth/verify-signed-request";
import { pollJobsForNode } from "@/lib/data/node-api";

export async function POST(request) {
    return handleRoute(async () => {
        const { pubkey, body } = await verifySignedNextRequest(request);
        const json = parseJsonBody(body);
        const result = await pollJobsForNode({ pubkey, limit: json.limit });
        return NextResponse.json({ data: result });
    });
}
