import { NextResponse } from "next/server";
import { handleRoute } from "@/lib/http";
import { verifyBearerHeader, issueBearer } from "@/lib/auth/bearer";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/user/deploy/provision
 *
 * Mints a short-lived (24h) CLI bearer scoped for one-click deploys.
 * The caller is already authenticated as a Supabase user — we trust
 * the existing CLI bearer and re-issue a fresh one with a tight TTL
 * for embedding in cloud-init scripts that rent boxes from third
 * parties (DigitalOcean, RunPod, etc.).
 *
 * Why a separate token instead of re-using the caller's bearer:
 *   - Tight TTL (24h vs 30d) limits blast radius if leaked
 *   - Eventually scope-restricted (deploy-only) so it can't read
 *     user-level data even if exfil'd
 *   - Issuer can revoke just the deploy tokens without nuking the
 *     CLI sessions of the user's other devices (next iteration)
 *
 * Body: { } — nothing required for now
 * Response: { token, expires_at, cloud_init_url }
 */
const DEPLOY_TTL_SECONDS = 24 * 60 * 60;

export async function POST(request) {
    return handleRoute(async () => {
        const claims = verifyBearerHeader(request.headers.get("authorization"));
        if (!claims?.sub) {
            const err = new Error("not signed in — log in via the dashboard or `infernet login` first");
            err.status = 401;
            throw err;
        }

        const token = issueBearer({
            userId: claims.sub,
            email: claims.email ?? null,
            ttlSeconds: DEPLOY_TTL_SECONDS
        });

        const expiresAt = new Date(Date.now() + DEPLOY_TTL_SECONDS * 1000).toISOString();

        return NextResponse.json({
            data: {
                token,
                expires_at: expiresAt,
                ttl_seconds: DEPLOY_TTL_SECONDS,
                cloud_init_url:
                    `/api/deploy/cloud-init?token=${encodeURIComponent(token)}`
            }
        });
    });
}
