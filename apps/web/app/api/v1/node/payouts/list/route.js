import { NextResponse } from "next/server";

import { handleRoute } from "@/lib/http";
import { verifySignedNextRequest } from "@/lib/auth/verify-signed-request";
import { listPayoutsForNode } from "@/lib/data/node-api";

export async function POST(request) {
    return handleRoute(async () => {
        const { pubkey } = await verifySignedNextRequest(request);
        const result = await listPayoutsForNode({ pubkey });
        return NextResponse.json({ data: result });
    });
}
