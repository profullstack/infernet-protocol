import { NextResponse } from "next/server";

/**
 * Liveness probe. No DB calls, no external dependencies — returns 200
 * as long as the Next.js process is alive and routing requests.
 *
 * Used by Railway's healthcheck (see railway.toml). Pointing the
 * healthcheck at /api/overview was a mistake — that route depends on
 * Supabase, so a deployment with missing or bad SUPABASE_* env vars
 * fails the healthcheck and gets killed before anyone can diagnose.
 *
 * If you need a deeper "is the system actually working" check
 * (dashboard data, provider liveness, etc.), build that on top — but
 * keep this endpoint dependency-free.
 */
export const dynamic = "force-dynamic";

export async function GET() {
    return NextResponse.json({
        ok: true,
        uptime_s: Math.round(process.uptime()),
        node_env: process.env.NODE_ENV ?? null,
        commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7)
            ?? process.env.GIT_COMMIT_SHA?.slice(0, 7)
            ?? null
    });
}
