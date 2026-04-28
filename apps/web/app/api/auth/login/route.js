import { NextResponse } from "next/server";
import { getSupabaseAuthClient } from "@/lib/supabase/auth-server";
import { parseAuthBody, wantsRedirect } from "@/lib/auth/parse-body";

export const dynamic = "force-dynamic";

function appUrl() {
    return process.env.NEXT_PUBLIC_APP_URL ?? "https://infernetprotocol.com";
}

/**
 * Two flows behind one endpoint:
 *   - email + password → sign in directly
 *   - email only       → send a magic link (use case: passwordless)
 */
export async function POST(request) {
    const body = await parseAuthBody(request);
    const wantHtml = wantsRedirect(request);
    const email = String(body.email ?? "").trim();
    const password = body.password ? String(body.password) : null;

    if (!email) {
        return wantHtml
            ? NextResponse.redirect(
                new URL(`/auth/login?error=${encodeURIComponent("email required")}`, request.url),
                { status: 303 }
            )
            : NextResponse.json({ error: "email required" }, { status: 400 });
    }

    const supabase = await getSupabaseAuthClient();

    if (password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            return wantHtml
                ? NextResponse.redirect(
                    new URL(`/auth/login?error=${encodeURIComponent(error.message)}`, request.url),
                    { status: 303 }
                )
                : NextResponse.json({ error: error.message }, { status: 401 });
        }
        return wantHtml
            ? NextResponse.redirect(new URL("/status", request.url), { status: 303 })
            : NextResponse.json({ ok: true });
    }

    // Magic link path
    const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${appUrl()}/api/auth/callback?next=/status` }
    });
    if (error) {
        return wantHtml
            ? NextResponse.redirect(
                new URL(`/auth/login?error=${encodeURIComponent(error.message)}`, request.url),
                { status: 303 }
            )
            : NextResponse.json({ error: error.message }, { status: 400 });
    }

    return wantHtml
        ? NextResponse.redirect(new URL("/auth/check-email?reason=magic-link", request.url), { status: 303 })
        : NextResponse.json({ ok: true, message: "Magic link sent." });
}
