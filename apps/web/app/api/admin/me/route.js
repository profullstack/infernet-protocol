import { NextResponse } from "next/server";
import { verifyBearerHeader } from "@/lib/auth/bearer";

export const dynamic = "force-dynamic";

/**
 * IPIP-0003 phase 3 — bearer-protected user introspection.
 *
 * Returns the authenticated user's claims. The CLI / SDK call this
 * to verify the token they hold is still valid and to display
 * "logged in as <email>" in the TUI / status bar.
 *
 *   GET /api/admin/me
 *   Authorization: Bearer <token>
 *
 *   200 → { userId, email, issuedAt, expiresAt, scope }
 *   401 → { error: "Unauthorized" }
 */
export async function GET(request) {
    const claims = verifyBearerHeader(request.headers.get("authorization"));
    if (!claims) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({
        userId: claims.sub,
        email: claims.email ?? null,
        issuedAt: claims.iat ? new Date(claims.iat * 1000).toISOString() : null,
        expiresAt: claims.exp ? new Date(claims.exp * 1000).toISOString() : null,
        scope: claims.scope ?? null
    });
}
