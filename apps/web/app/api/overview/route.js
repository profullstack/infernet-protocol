import { NextResponse } from "next/server";
import { getDashboardOverview } from "@/lib/data/infernet";
import { handleRoute } from "@/lib/http";
import { maybeVerifySignedNextRequest } from "@/lib/auth/verify-signed-request";

export async function GET(request) {
  return handleRoute(async () => {
    const auth = await maybeVerifySignedNextRequest(request);
    const overview = await getDashboardOverview({ pubkey: auth?.pubkey });
    return NextResponse.json(overview);
  });
}
