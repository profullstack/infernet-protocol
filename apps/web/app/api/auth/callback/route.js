import { NextResponse } from "next/server";
import { getSupabaseAuthClient } from "@/lib/supabase/auth-server";
import { appUrl } from "@/lib/auth/app-url";

export const dynamic = "force-dynamic";

/**
 * Email confirmation + magic-link landing.
 *
 * Supabase's redirect URL after a magic-link click looks like:
 *   /api/auth/callback?code=<pkce>&next=/status
 *
 * We exchange the PKCE code for a session (Supabase sets the session
 * cookie via @supabase/ssr) and redirect to `next`.
 */
export async function GET(request) {
    // Parse inbound query (code, next) from the request itself; build
    // outbound redirects against appUrl() so we don't leak proxy hosts.
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const next = url.searchParams.get("next") || "/status";

    if (!code) {
        return NextResponse.redirect(
            new URL(`/auth/login?error=${encodeURIComponent("missing code")}`, appUrl())
        );
    }

    const supabase = await getSupabaseAuthClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
        return NextResponse.redirect(
            new URL(`/auth/login?error=${encodeURIComponent(error.message)}`, appUrl())
        );
    }

    return NextResponse.redirect(new URL(next, appUrl()));
}
