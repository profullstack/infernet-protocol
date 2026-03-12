import { NextResponse } from "next/server";
import { getModels } from "@/lib/data/infernet";
import { handleRoute } from "@/lib/http";

export async function GET(request) {
  return handleRoute(async () => {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit");
    const rows = await getModels({
      limit: limit ? Number(limit) : undefined
    });
    return NextResponse.json({ data: rows });
  });
}
