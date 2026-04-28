import { NextResponse } from "next/server";
import { handleRoute } from "@/lib/http";
import { verifyBearerHeader, issueBearer } from "@/lib/auth/bearer";
import { getCurrentUser } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/user/deploy/provision
 *
 * Mints a short-lived (24h) CLI bearer scoped for one-click deploys.
 *
 * Two auth paths are accepted (in priority order) so both browser
 * users on /deploy and CLI users running `infernet login` can mint:
 *   1. Authorization: Bearer <CLI JWT>      — for CLI callers
 *   2. Supabase session cookie via @supabase/ssr  — for /deploy page
 *
 * Either one resolves to a Supabase user_id that gets stamped into
 * a fresh 24h-TTL CLI bearer. The browser uses the cookie path
 * because fetch() from /deploy doesn't carry an Authorization header.
 *
 * Why a separate token instead of re-using the caller's:
 *   - tight TTL (24h vs 30d) limits blast radius if leaked into a
 *     cloud-init log
 *   - eventually scope-restricted ("deploy") so it can't read user-
 *     level data even if exfil'd
 *   - issuer can revoke just the deploy tokens without nuking the
 *     CLI sessions of the user's other devices
 *
 * Body: {}
 * Response: { token, expires_at, ttl_seconds, cloud_init_url }
 */
const DEPLOY_TTL_SECONDS = 24 * 60 * 60;

async function resolveUser(request) {
    // Path 1: CLI bearer in Authorization header.
    const claims = verifyBearerHeader(request.headers.get("authorization"));
    if (claims?.sub) {
        return { userId: claims.sub, email: claims.email ?? null };
    }
    // Path 2: Supabase session cookie set by /api/auth/login.
    try {
        const user = await getCurrentUser();
        if (user?.id) return { userId: user.id, email: user.email ?? null };
    } catch {
        /* fall through to 401 */
    }
    return null;
}

export async function POST(request) {
    return handleRoute(async () => {
        const auth = await resolveUser(request);
        if (!auth) {
            const err = new Error(
                "not signed in — sign in via the dashboard or `infernet login` first"
            );
            err.status = 401;
            throw err;
        }

        const token = issueBearer({
            userId: auth.userId,
            email: auth.email,
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
