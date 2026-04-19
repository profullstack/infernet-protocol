import { NextResponse } from "next/server";

import { handleRoute } from "@/lib/http";
import {
    verifySignedNextRequest,
    parseJsonBody
} from "@/lib/auth/verify-signed-request";
import { setPayoutForNode } from "@/lib/data/node-api";

export async function POST(request) {
    return handleRoute(async () => {
        const { pubkey, body } = await verifySignedNextRequest(request);
        const json = parseJsonBody(body);
        const result = await setPayoutForNode({
            pubkey,
            coin: typeof json.coin === "string" ? json.coin.toUpperCase() : null,
            network: typeof json.network === "string" ? json.network : null,
            address: typeof json.address === "string" ? json.address : null
        });
        return NextResponse.json({ data: result });
    });
}
