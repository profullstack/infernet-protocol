import { NextResponse } from "next/server";
import { getCpuFleet } from "@/lib/data/infernet";
import { handleRoute } from "@/lib/http";

export async function GET(request) {
  return handleRoute(async () => {
    const { searchParams } = new URL(request.url);
    const liveWindowMin = Number(searchParams.get("liveWindowMin")) || undefined;
    const data = await getCpuFleet({ liveWindowMin });
    return NextResponse.json({ data });
  });
}
