import { NextResponse } from "next/server";
import { drainPendingReceipts } from "@/lib/cpr/queue-drain";
import { handleRoute } from "@/lib/http";

/**
 * IPIP-0007 phase 3 — queue drain endpoint.
 *
 * Hit on a schedule (Vercel Cron, Supabase pg_cron, GitHub Actions
 * cron, an external uptime monitor, whatever your deployment uses)
 * to flush pending CPR receipts.
 *
 * Auth: bearer token matching `CRON_SECRET` env. Skip if not
 * configured — better to fail closed than expose an unauthenticated
 * worker endpoint.
 *
 * Suggested cadence: every 1–5 minutes. CPR receipts have a 30s
 * back-off floor and 8 retries before status=failed (~64 minutes
 * total), so 1-minute polling gives the queue plenty of throughput
 * without being wasteful.
 */
function authorized(request) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return false;
    const auth = request.headers.get("authorization") ?? "";
    return auth === `Bearer ${expected}`;
}

export async function POST(request) {
    return handleRoute(async () => {
        if (!authorized(request)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const result = await drainPendingReceipts();
        return NextResponse.json({ data: result });
    });
}

// GET also runs the drain — some cron services (e.g. simple uptime
// pingers) only do GET. Same auth.
export const GET = POST;
