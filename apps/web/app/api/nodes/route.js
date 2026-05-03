import { NextResponse } from "next/server";
import { getNodes } from "@/lib/data/infernet";
import { handleRoute } from "@/lib/http";
import { maybeVerifySignedNextRequest } from "@/lib/auth/verify-signed-request";

export async function GET(request) {
  return handleRoute(async () => {
    const auth = await maybeVerifySignedNextRequest(request);
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit");
    const status = searchParams.get("status");
    const rows = await getNodes({
      limit: limit ? Number(limit) : undefined,
      status: status || undefined,
      pubkey: auth?.pubkey
    });
    return NextResponse.json({ data: rows });
  });
}
