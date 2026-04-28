import { NextResponse } from "next/server";
import { getSupabaseAuthClient } from "@/lib/supabase/auth-server";
import { parseAuthBody, wantsRedirect } from "@/lib/auth/parse-body";

export const dynamic = "force-dynamic";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(request) {
    const { password } = await parseAuthBody(request);
    const wantHtml = wantsRedirect(request);

    if (!password || password.length < MIN_PASSWORD_LENGTH) {
        const msg = `password must be at least ${MIN_PASSWORD_LENGTH} characters`;
        return wantHtml
            ? NextResponse.redirect(
                new URL(`/auth/update-password?error=${encodeURIComponent(msg)}`, request.url),
                { status: 303 }
            )
            : NextResponse.json({ error: msg }, { status: 400 });
    }

    const supabase = await getSupabaseAuthClient();
    // Caller must be authenticated — the password-recovery email lands
    // them on /auth/update-password, which only renders when there's a
    // valid recovery session in the cookie.
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
        return wantHtml
            ? NextResponse.redirect(
                new URL(`/auth/update-password?error=${encodeURIComponent(error.message)}`, request.url),
                { status: 303 }
            )
            : NextResponse.json({ error: error.message }, { status: 400 });
    }

    return wantHtml
        ? NextResponse.redirect(new URL("/status?password-updated=1", request.url), { status: 303 })
        : NextResponse.json({ ok: true });
}
