import { NextResponse } from "next/server";
import { handleRoute } from "@/lib/http";
import { listPetalsSwarm } from "@/lib/data/petals-swarm";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/petals/swarm
 *
 * Public read. Returns models currently being served via Petals + the
 * count of providers in each swarm. Backs the `/chat` model-picker
 * badge ("3 nodes serving · distributed") and `infernet inference list`.
 */
export async function GET() {
    return handleRoute(async () => {
        const data = await listPetalsSwarm();
        return NextResponse.json({ data }, {
            headers: { "cache-control": "public, max-age=10" }
        });
    });
}
