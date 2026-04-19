import { NextResponse } from "next/server";

import { handleRoute } from "@/lib/http";
import {
    verifySignedNextRequest,
    parseJsonBody
} from "@/lib/auth/verify-signed-request";
import { listPaymentsForNode } from "@/lib/data/node-api";

const VALID_ROLES = new Set(["provider", "aggregator", "client"]);

export async function POST(request) {
    return handleRoute(async () => {
        const { pubkey, body } = await verifySignedNextRequest(request);
        const json = parseJsonBody(body);
        const role = typeof json.role === "string" ? json.role.toLowerCase() : null;
        if (!VALID_ROLES.has(role)) {
            const err = new Error(`role must be one of: ${[...VALID_ROLES].join(", ")}`);
            err.status = 400;
            throw err;
        }
        const limit = Number.isFinite(json.limit) ? json.limit : 20;
        const result = await listPaymentsForNode({ role, pubkey, limit });
        return NextResponse.json({ data: result });
    });
}
