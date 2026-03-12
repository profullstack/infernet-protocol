import { NextResponse } from "next/server";
import { getDashboardOverview } from "@/lib/data/infernet";
import { handleRoute } from "@/lib/http";

export async function GET() {
  return handleRoute(async () => {
    const overview = await getDashboardOverview();
    return NextResponse.json(overview);
  });
}
